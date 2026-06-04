/**
 * Outbound Engine API (Email Bison). The engine stores campaign *definitions* and orchestrates
 * the Bison lifecycle: sync existing campaigns, build+launch new ones, push segments, pull stats.
 * Guardrails: preview-before-create, confirm-before-launch, deliverability-gated segments.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { bisonCampaigns, bisonSequences, bisonSenderAssignments, bisonCampaignStats } from '../../db/schema.js';
import {
  listCampaigns, listSenders, createCampaign, scheduleCampaign, setSequenceSteps,
  attachSenders, resumeCampaign, pauseCampaign, getCampaignStats, sendTest,
  type BisonSchedule, type BisonSequenceStep,
} from '../../engine/adapters/emailbison.js';
import { segmentCount, pushToBison } from '../../engine/stages/activate.js';
import { asyncHandler } from '../middleware.js';
import { rateLimit, validateBody } from '../validate.js';

export const outboundRouter = Router();

const err = (res: import('express').Response, status: number, msg: string) => res.status(status).json({ error: msg });

// ----------------------------------------------------------------- read / sync
/** List our stored campaign definitions (joined with latest stats). */
outboundRouter.get('/campaigns', asyncHandler(async (_req, res) => {
  const rows = await db.select().from(bisonCampaigns).orderBy(desc(bisonCampaigns.id));
  res.json({ campaigns: rows });
}));

/** Single campaign with its sequence steps, senders, and latest stats. */
outboundRouter.get('/campaigns/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const [c] = await db.select().from(bisonCampaigns).where(eq(bisonCampaigns.id, id));
  if (!c) return err(res, 404, 'not found');
  const steps = await db.select().from(bisonSequences).where(eq(bisonSequences.campaignId, id)).orderBy(bisonSequences.stepOrder);
  const senders = await db.select().from(bisonSenderAssignments).where(eq(bisonSenderAssignments.campaignId, id));
  const [stats] = await db.select().from(bisonCampaignStats).where(eq(bisonCampaignStats.campaignId, id)).orderBy(desc(bisonCampaignStats.capturedAt)).limit(1);
  res.json({ campaign: c, steps, senders, stats: stats ?? null });
}));

/** Pull the live campaign list from Bison and upsert into our store (read-only mirror). */
outboundRouter.post('/sync', rateLimit(10, 60_000), asyncHandler(async (_req, res) => {
  const live = await listCampaigns();
  let added = 0, updated = 0;
  for (const lc of live) {
    const [existing] = await db.select().from(bisonCampaigns).where(eq(bisonCampaigns.bisonCampaignId, lc.id));
    if (existing) {
      await db.update(bisonCampaigns).set({ name: lc.name, status: lc.status ?? existing.status, syncedAt: new Date() }).where(eq(bisonCampaigns.id, existing.id));
      updated++;
    } else {
      await db.insert(bisonCampaigns).values({ bisonCampaignId: lc.id, name: lc.name, status: lc.status ?? 'created', syncedAt: new Date() });
      added++;
    }
  }
  res.json({ synced: live.length, added, updated });
}));

/** Sender inboxes available in the workspace (for the builder's sender picker). */
outboundRouter.get('/senders', asyncHandler(async (_req, res) => {
  res.json({ senders: await listSenders() });
}));

/** Preview how many deliverability-gated contacts a segment would send to. */
outboundRouter.get('/segment-count', asyncHandler(async (req, res) => {
  const persona = req.query.persona ? String(req.query.persona).slice(0, 64) : undefined;
  const subType = req.query.subType ? String(req.query.subType).slice(0, 64) : undefined;
  res.json({ count: await segmentCount({ persona, subType }) });
}));

// ----------------------------------------------------------------- create / build
const stepSchema = z.object({
  email_subject: z.string().min(1).max(300),
  email_body: z.string().min(1).max(20000),
  wait_in_days: z.number().int().min(0).max(90),
  order: z.number().int().min(1),
  thread_reply: z.boolean().optional(),
  variant: z.string().max(20).optional(),
});
const scheduleSchema = z.object({
  timezone: z.string().max(64),
  days: z.array(z.object({ day: z.string(), from: z.string(), to: z.string() })).max(7),
});
const buildSchema = z.object({
  name: z.string().min(1).max(200),
  persona: z.string().max(64).optional(),
  subType: z.string().max(64).optional(),
  schedule: scheduleSchema.optional(),
  senderEmailIds: z.array(z.number().int().positive()).max(50).optional(),
  steps: z.array(stepSchema).min(1).max(20),
  limits: z.record(z.unknown()).optional(),
});

/**
 * Build a campaign end-to-end in Bison: create → schedule → sequence steps → attach senders.
 * Stores the definition locally. Does NOT launch (status stays 'created' until /launch).
 * Each Bison call is checked; the first failure aborts and reports which step failed.
 */
outboundRouter.post('/campaigns', rateLimit(10, 60_000), validateBody(buildSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof buildSchema>;

  const created = await createCampaign(b.name);
  if (!created) return err(res, 502, 'Bison: create campaign failed');
  const bisonId = created.id;

  const fails: string[] = [];
  if (b.schedule) { const r = await scheduleCampaign(bisonId, b.schedule as BisonSchedule); if (!r.ok) fails.push(`schedule (${r.status})`); }
  { const r = await setSequenceSteps(bisonId, b.steps as BisonSequenceStep[]); if (!r.ok) fails.push(`sequence-steps (${r.status})`); }
  if (b.senderEmailIds?.length) { const r = await attachSenders(bisonId, b.senderEmailIds); if (!r.ok) fails.push(`attach-senders (${r.status})`); }

  // Persist the definition locally regardless (so a partial build is visible/repairable).
  const [row] = await db.insert(bisonCampaigns).values({
    bisonCampaignId: bisonId, name: b.name, status: 'created',
    persona: b.persona, subType: b.subType,
    scheduleJson: b.schedule ?? null, limitsJson: b.limits ?? null,
    syncedAt: new Date(),
  }).returning();
  await db.insert(bisonSequences).values(b.steps.map((s) => ({
    campaignId: row.id, stepOrder: s.order, waitInDays: s.wait_in_days,
    subject: s.email_subject, body: s.email_body, variant: s.variant ?? null, threadReply: s.thread_reply ?? false,
  })));
  if (b.senderEmailIds?.length) {
    await db.insert(bisonSenderAssignments).values(b.senderEmailIds.map((sid) => ({ campaignId: row.id, senderEmailId: sid })));
  }

  res.json({ id: row.id, bisonCampaignId: bisonId, partialFailures: fails });
}));

// ----------------------------------------------------------------- launch / pause / test
const idBody = z.object({ confirm: z.literal(true) });

/** Launch (resume) a configured campaign in Bison. Requires confirm. */
outboundRouter.post('/campaigns/:id/launch', rateLimit(10, 60_000), validateBody(idBody), asyncHandler(async (req, res) => {
  const [c] = await db.select().from(bisonCampaigns).where(eq(bisonCampaigns.id, Number(req.params.id)));
  if (!c?.bisonCampaignId) return err(res, 404, 'campaign not created in Bison');
  const r = await resumeCampaign(c.bisonCampaignId);
  if (!r.ok) return err(res, 502, `Bison resume failed (${r.status})`);
  await db.update(bisonCampaigns).set({ status: 'active' }).where(eq(bisonCampaigns.id, c.id));
  res.json({ ok: true, status: 'active' });
}));

outboundRouter.post('/campaigns/:id/pause', rateLimit(10, 60_000), asyncHandler(async (req, res) => {
  const [c] = await db.select().from(bisonCampaigns).where(eq(bisonCampaigns.id, Number(req.params.id)));
  if (!c?.bisonCampaignId) return err(res, 404, 'campaign not created in Bison');
  const r = await pauseCampaign(c.bisonCampaignId);
  if (!r.ok) return err(res, 502, `Bison pause failed (${r.status})`);
  await db.update(bisonCampaigns).set({ status: 'paused' }).where(eq(bisonCampaigns.id, c.id));
  res.json({ ok: true, status: 'paused' });
}));

const testSchema = z.object({ email: z.string().email() });
outboundRouter.post('/campaigns/:id/send-test', rateLimit(10, 60_000), validateBody(testSchema), asyncHandler(async (req, res) => {
  const [c] = await db.select().from(bisonCampaigns).where(eq(bisonCampaigns.id, Number(req.params.id)));
  if (!c?.bisonCampaignId) return err(res, 404, 'campaign not created in Bison');
  const r = await sendTest(c.bisonCampaignId, (req.body as z.infer<typeof testSchema>).email);
  res.json({ ok: r.ok, status: r.status });
}));

/** Refresh stats from Bison and snapshot them locally (for trend/compare). */
outboundRouter.post('/campaigns/:id/refresh-stats', rateLimit(20, 60_000), asyncHandler(async (req, res) => {
  const [c] = await db.select().from(bisonCampaigns).where(eq(bisonCampaigns.id, Number(req.params.id)));
  if (!c?.bisonCampaignId) return err(res, 404, 'campaign not created in Bison');
  const s = await getCampaignStats(c.bisonCampaignId);
  if (!s) return err(res, 502, 'Bison stats unavailable');
  const [row] = await db.insert(bisonCampaignStats).values({
    campaignId: c.id, sent: num(s.sent), opens: num(s.opens), replies: num(s.replies),
    bounces: num(s.bounces), interested: num(s.interested), unsubscribed: num(s.unsubscribed),
    perStepJson: s,
  }).returning();
  res.json({ stats: row });
}));

// ----------------------------------------------------------------- push segment
const pushSchema = z.object({
  confirm: z.literal(true),
  persona: z.string().max(64).optional(),
  subType: z.string().max(64).optional(),
});
/** Push the deliverability-gated segment into the campaign's Bison campaign. SSE. */
outboundRouter.post('/campaigns/:id/push', rateLimit(5, 60_000), validateBody(pushSchema), async (req, res) => {
  const [c] = await db.select().from(bisonCampaigns).where(eq(bisonCampaigns.id, Number(req.params.id)));
  if (!c?.bisonCampaignId) { err(res, 404, 'campaign not created in Bison'); return; }
  const { persona, subType } = req.body as z.infer<typeof pushSchema>;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  let aborted = false;
  req.on('close', () => { aborted = true; });
  const send = (event: string, data: unknown) => { if (!aborted && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  try {
    const filter = { persona: persona ?? c.persona ?? undefined, subType: subType ?? c.subType ?? undefined };
    const result = await pushToBison(c.bisonCampaignId, filter, (m) => send('log', { message: m }));
    await db.insert((await import('../../db/schema.js')).bisonPushLog).values({
      campaignId: c.id, leadsCreated: result.created, leadsAttached: result.attached, segmentFilterJson: filter,
    });
    send('done', result);
  } catch (e) {
    console.error('[outbound/push]', (e as Error).stack ?? e);
    send('error', { message: 'Push failed — see server logs' });
  } finally { if (!res.writableEnded) res.end(); }
});

function num(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }

void and;
