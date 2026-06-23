/**
 * Outbound Engine API (Email Bison). The engine stores campaign *definitions* and orchestrates
 * the Bison lifecycle: sync existing campaigns, build+launch new ones, push segments, pull stats.
 * Guardrails: preview-before-create, confirm-before-launch, deliverability-gated segments.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  bisonCampaigns, bisonSequences, bisonSenderAssignments, bisonCampaignStats,
  sequenceTemplates, bisonReplies, bisonPushLog,
} from '../../db/schema.js';
import {
  listCampaigns, listSenders, createCampaign, scheduleCampaign, setSequenceSteps,
  attachSenders, resumeCampaign, pauseCampaign, getCampaignStats, sendTest,
  listReplies, markInterested,
  type BisonSchedule, type BisonSequenceStep,
} from '../../engine/adapters/emailbison.js';
import { segmentCount, pushToBison } from '../../engine/stages/activate.js';
import { runGenerateSequence } from '../../engine/recipes.js';
import { isConfiguredAsync } from '../../engine/adapters/anthropic.js';
import { COLD_EMAIL_STYLES } from '../../engine/email/styles.js';
import { EMAIL_PERSONAS } from '../../engine/email/personas.js';
import { LEAD_MAGNETS } from '../../engine/email/leadMagnets.js';
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
    await db.insert(bisonPushLog).values({
      campaignId: c.id, leadsCreated: result.created, leadsAttached: result.attached, segmentFilterJson: filter,
    });
    send('done', result);
  } catch (e) {
    console.error('[outbound/push]', (e as Error).stack ?? e);
    send('error', { message: 'Push failed — see server logs' });
  } finally { if (!res.writableEnded) res.end(); }
});

// ----------------------------------------------------------------- AI sequence writer
/** Cold-email style library (skeletons) for the generator picker. */
outboundRouter.get('/email-styles', asyncHandler(async (_req, res) => {
  res.json({
    styles: COLD_EMAIL_STYLES.map((s) => ({
      key: s.key, name: s.name, status: s.status, summary: s.summary,
      whenToUse: s.whenToUse, supportsOffer: s.supportsOffer,
      steps: s.steps.map((st) => ({ order: st.order, waitDays: st.waitDays, label: st.label })),
    })),
  });
}));

/** Persona library with pain/value, for the generator picker + hints. */
outboundRouter.get('/email-personas', asyncHandler(async (_req, res) => {
  res.json({
    personas: EMAIL_PERSONAS.map((p) => ({
      key: p.key, name: p.name, blurb: p.blurb, pain: p.pain, value: p.value,
      pains: p.pains, presets: p.presets ?? [], icpTypes: p.icpTypes ?? [],
    })),
  });
}));

/** Curated lead-magnet library for offer-centric styles. */
outboundRouter.get('/lead-magnets', asyncHandler(async (_req, res) => {
  res.json({
    leadMagnets: LEAD_MAGNETS.map((m) => ({
      id: m.id, title: m.title, hook: m.hook, format: m.format, personaFit: m.personaFit,
    })),
  });
}));

const generateSchema = z.object({
  styleKey: z.string().min(1).max(64),
  persona: z.string().min(1).max(64),
  senderMode: z.enum(['greg', 'edify']),
  senderName: z.string().max(120).optional(),
  leadMagnetId: z.string().max(80).optional(),
  painKey: z.string().max(64).optional(),
  painCustom: z.string().max(300).optional(),
  abVariant: z.boolean().optional(),
  extraContext: z.string().max(2000).optional(),
});

/**
 * Generate a cold-email sequence with Claude (Opus). Returns steps the UI loads into the
 * editable Sequence Builder. Does NOT persist — saving goes through POST /sequences.
 * Gated on an Anthropic key being configured (DB-first, then env).
 */
outboundRouter.post('/sequences/generate', rateLimit(15, 60_000), validateBody(generateSchema), asyncHandler(async (req, res) => {
  if (!(await isConfiguredAsync())) {
    return err(res, 400, 'Anthropic API key not configured — add it under Settings to generate copy.');
  }
  const b = req.body as z.infer<typeof generateSchema>;
  try {
    const { result } = await runGenerateSequence(b);
    res.json({
      steps: result.steps, rationale: result.rationale,
      style: result.styleName, persona: result.personaName,
      // Metadata facets the UI persists onto the saved template (for the library inputs + filters).
      meta: {
        styleKey: result.styleKey, personaKey: result.personaKey,
        painKey: result.painKey, painLabel: result.painLabel,
        leadMagnetId: result.leadMagnetId, senderMode: result.senderMode,
        abVariant: result.abVariant, genModel: 'claude-opus-4-8',
      },
    });
  } catch (e) {
    return err(res, 502, `Generation failed: ${(e as Error).message}`);
  }
}));

// ----------------------------------------------------------------- sequence templates (library)
const seqStepSchema = z.object({
  order: z.number().int().min(1),
  wait_in_days: z.number().int().min(0).max(90),
  email_subject: z.string().min(1).max(300),
  email_body: z.string().min(1).max(20000),
  variant: z.string().max(20).optional(),
  thread_reply: z.boolean().optional(),
});
const seqMetaSchema = z.object({
  styleKey: z.string().max(64).optional(),
  personaKey: z.string().max(64).optional(),
  painKey: z.string().max(64).optional(),
  painLabel: z.string().max(300).optional(),
  leadMagnetId: z.string().max(80).optional(),
  senderMode: z.enum(['greg', 'edify']).optional(),
  abVariant: z.boolean().optional(),
  rationale: z.string().max(4000).optional(),
  genModel: z.string().max(64).optional(),
}).optional();
const seqSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  persona: z.string().max(64).optional(),
  steps: z.array(seqStepSchema).min(1).max(20),
  meta: seqMetaSchema,
});

/** Map the optional generation-meta block to DB columns (null-safe; only set when present). */
function metaColumns(meta?: z.infer<typeof seqMetaSchema>) {
  if (!meta) return {};
  return {
    styleKey: meta.styleKey ?? null,
    personaKey: meta.personaKey ?? null,
    painKey: meta.painKey ?? null,
    painLabel: meta.painLabel ?? null,
    leadMagnetId: meta.leadMagnetId ?? null,
    senderMode: meta.senderMode ?? null,
    abVariant: meta.abVariant ?? false,
    rationale: meta.rationale ?? null,
    genModel: meta.genModel ?? null,
    generatedAt: new Date(),
  };
}

outboundRouter.get('/sequences', asyncHandler(async (_req, res) => {
  res.json({ sequences: await db.select().from(sequenceTemplates).orderBy(desc(sequenceTemplates.id)) });
}));

outboundRouter.get('/sequences/:id', asyncHandler(async (req, res) => {
  const [s] = await db.select().from(sequenceTemplates).where(eq(sequenceTemplates.id, Number(req.params.id)));
  if (!s) return err(res, 404, 'not found');
  res.json({ sequence: s });
}));

outboundRouter.post('/sequences', rateLimit(20, 60_000), validateBody(seqSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof seqSchema>;
  const [row] = await db.insert(sequenceTemplates).values({
    name: b.name, description: b.description, persona: b.persona, stepsJson: b.steps,
    ...metaColumns(b.meta),
  }).returning();
  res.json({ sequence: row });
}));

outboundRouter.put('/sequences/:id', rateLimit(20, 60_000), validateBody(seqSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof seqSchema>;
  const [row] = await db.update(sequenceTemplates).set({
    name: b.name, description: b.description, persona: b.persona, stepsJson: b.steps, updatedAt: new Date(),
    ...metaColumns(b.meta),
  }).where(eq(sequenceTemplates.id, Number(req.params.id))).returning();
  if (!row) return err(res, 404, 'not found');
  res.json({ sequence: row });
}));

outboundRouter.delete('/sequences/:id', rateLimit(20, 60_000), asyncHandler(async (req, res) => {
  await db.delete(sequenceTemplates).where(eq(sequenceTemplates.id, Number(req.params.id)));
  res.json({ ok: true });
}));

// ----------------------------------------------------------------- replies / inbox
/** Count of unread positive replies — drives the nav badge. */
outboundRouter.get('/inbox/unread-count', asyncHandler(async (_req, res) => {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(bisonReplies)
    .where(and(eq(bisonReplies.status, 'new'), eq(bisonReplies.isPositive, true)));
  res.json({ count: Number(n) });
}));

/** List replies (positive first, newest first). ?positive=1 to filter to positive only. */
outboundRouter.get('/inbox', asyncHandler(async (req, res) => {
  const positiveOnly = req.query.positive === '1';
  const rows = await db.select().from(bisonReplies)
    .where(positiveOnly ? eq(bisonReplies.isPositive, true) : undefined)
    .orderBy(desc(bisonReplies.isPositive), desc(bisonReplies.receivedAt)).limit(200);
  res.json({ replies: rows });
}));

/** Pull replies from Bison and upsert into our inbox (dedup by bisonReplyId). */
outboundRouter.post('/inbox/sync', rateLimit(20, 60_000), asyncHandler(async (_req, res) => {
  const live = await listReplies(1);
  let added = 0;
  for (const r of live) {
    const email = r.lead?.email ?? r.email ?? null;
    const name = [r.lead?.first_name ?? r.first_name, r.lead?.last_name ?? r.last_name].filter(Boolean).join(' ') || null;
    const positive = !!(r.interested || r.is_interested) || /interest|positive/i.test(String(r.sentiment ?? ''));
    const replyId = String(r.id ?? `${email}-${r.created_at ?? r.received_at ?? ''}`);
    const [existing] = await db.select({ id: bisonReplies.id }).from(bisonReplies).where(eq(bisonReplies.bisonReplyId, replyId));
    if (existing) continue;
    const [ourCamp] = r.campaign_id
      ? await db.select({ id: bisonCampaigns.id }).from(bisonCampaigns).where(eq(bisonCampaigns.bisonCampaignId, r.campaign_id))
      : [undefined];
    await db.insert(bisonReplies).values({
      campaignId: ourCamp?.id ?? null, bisonCampaignId: r.campaign_id ?? null, bisonReplyId: replyId,
      leadEmail: email, leadName: name, subject: r.subject ?? null,
      body: r.body ?? r.message ?? r.text ?? null,
      sentiment: r.sentiment ?? (positive ? 'interested' : 'unknown'), isPositive: positive, raw: r,
    }).onConflictDoNothing();
    added++;
  }
  res.json({ pulled: live.length, added });
}));

/** Mark a reply read/handled, optionally flag interested in Bison. */
const replyActionSchema = z.object({ status: z.enum(['new', 'read', 'handled']).optional(), markInterested: z.boolean().optional() });
outboundRouter.post('/inbox/:id/action', rateLimit(60, 60_000), validateBody(replyActionSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof replyActionSchema>;
  const [reply] = await db.select().from(bisonReplies).where(eq(bisonReplies.id, Number(req.params.id)));
  if (!reply) return err(res, 404, 'not found');
  if (b.status) await db.update(bisonReplies).set({ status: b.status }).where(eq(bisonReplies.id, reply.id));
  let interestedOk: boolean | undefined;
  if (b.markInterested && reply.leadEmail) {
    const r = await markInterested(reply.leadEmail, reply.bisonCampaignId ?? undefined);
    interestedOk = r.ok;
    await db.update(bisonReplies).set({ isPositive: true, sentiment: 'interested' }).where(eq(bisonReplies.id, reply.id));
  }
  res.json({ ok: true, interestedOk });
}));

// ----------------------------------------------------------------- performance (cross-campaign)
/** Latest stats snapshot per campaign + derived rates, for the comparison view. */
outboundRouter.get('/performance', asyncHandler(async (_req, res) => {
  const camps = await db.select().from(bisonCampaigns).orderBy(desc(bisonCampaigns.id));
  const out = [];
  for (const c of camps) {
    const [s] = await db.select().from(bisonCampaignStats).where(eq(bisonCampaignStats.campaignId, c.id))
      .orderBy(desc(bisonCampaignStats.capturedAt)).limit(1);
    const [{ pos }] = await db.select({ pos: sql<number>`count(*)::int` }).from(bisonReplies)
      .where(and(eq(bisonReplies.campaignId, c.id), eq(bisonReplies.isPositive, true)));
    const sent = s?.sent ?? 0;
    out.push({
      id: c.id, name: c.name, status: c.status, persona: c.persona, subType: c.subType,
      sent, opens: s?.opens ?? 0, replies: s?.replies ?? 0, bounces: s?.bounces ?? 0,
      interested: s?.interested ?? 0, positiveReplies: Number(pos),
      openRate: sent ? (s?.opens ?? 0) / sent : 0,
      replyRate: sent ? (s?.replies ?? 0) / sent : 0,
      bounceRate: sent ? (s?.bounces ?? 0) / sent : 0,
      capturedAt: s?.capturedAt ?? null,
    });
  }
  res.json({ campaigns: out });
}));

function num(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }
