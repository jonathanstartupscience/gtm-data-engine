/**
 * Outbound Engine API (Email Bison). The engine stores campaign *definitions* and orchestrates
 * the Bison lifecycle: sync existing campaigns, build+launch new ones, push segments, pull stats.
 * Guardrails: preview-before-create, confirm-before-launch, deliverability-gated segments.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  bisonCampaigns, bisonSequences, bisonSenderAssignments, bisonCampaignStats,
  sequenceTemplates, bisonReplies, bisonPushLog,
  experiments, experimentArms, workspaces, notifyRoutes,
} from '../../db/schema.js';
import {
  bisonClientFor,
  type BisonSchedule, type BisonSequenceStep,
} from '../../engine/adapters/emailbison.js';
import { onNewReply } from '../../engine/notify/index.js';
import { segmentCount, pushToBison } from '../../engine/stages/activate.js';
import { previewExperiment } from '../../engine/stages/experiment.js';
import { runGenerateSequence, runRewriteStep, runExperimentPush } from '../../engine/recipes.js';
import { secretStatus } from '../../lib/secrets.js';
import { isConfiguredAsync } from '../../engine/adapters/anthropic.js';
import { COLD_EMAIL_STYLES } from '../../engine/email/styles.js';
import { EMAIL_PERSONAS } from '../../engine/email/personas.js';
import { LEAD_MAGNETS } from '../../engine/email/leadMagnets.js';
import { asyncHandler } from '../middleware.js';
import { rateLimit, validateBody } from '../validate.js';

export const outboundRouter = Router();

const err = (res: import('express').Response, status: number, msg: string) => res.status(status).json({ error: msg });

/**
 * Resolve the active Email-Engine workspace for a request. The UI sends the active workspace as
 * `?workspace=<slug>` (or `x-workspace` header). Defaults to ESO so legacy callers keep working.
 * Returns the workspace row; throws 400-style null if the slug is unknown.
 */
async function resolveWorkspace(req: import('express').Request) {
  const slug = String(req.query.workspace ?? req.header('x-workspace') ?? '').trim() || 'eso';
  const [w] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
  return w ?? null;
}

/** List workspaces + whether each has a Bison key configured and is actively sending (sub-switcher). */
outboundRouter.get('/workspaces', asyncHandler(async (_req, res) => {
  const rows = await db.select().from(workspaces).orderBy(workspaces.sortOrder);
  // "Sending" = the workspace has ≥1 campaign whose synced status is 'active'. One grouped query
  // instead of N: count active campaigns per workspace.
  const sendingRows = await db
    .select({ workspaceId: bisonCampaigns.workspaceId, n: sql<number>`count(*)::int` })
    .from(bisonCampaigns)
    .where(eq(bisonCampaigns.status, 'active'))
    .groupBy(bisonCampaigns.workspaceId);
  const activeCampaignsByWs = new Map(sendingRows.map((r) => [r.workspaceId, Number(r.n)]));
  const out = await Promise.all(rows.map(async (w) => {
    const status = await secretStatus(`EMAILBISON_API_KEY__${w.slug}`);
    const activeCampaigns = activeCampaignsByWs.get(w.id) ?? 0;
    return {
      id: w.id, slug: w.slug, name: w.name, persona: w.persona, active: w.active,
      sortOrder: w.sortOrder,
      keyConfigured: status.set,   // each workspace authenticates as itself — no global fallback
      keySource: (status.set ? 'workspace' : 'none') as 'workspace' | 'none',
      bisonBaseUrl: w.bisonBaseUrl,  // per-workspace Bison instance URL (null → shared default)
      activeCampaigns,        // # of synced campaigns currently 'active' in Bison
      sending: activeCampaigns > 0, // green = sending, red = not (reflects last sync)
    };
  }));
  res.json({ workspaces: out });
}));

/** Update the active workspace's Bison instance URL (per-workspace base; null/'' → shared default). */
const wsSettingsSchema = z.object({ bisonBaseUrl: z.string().trim().url().max(300).nullable() });
outboundRouter.patch('/workspaces', rateLimit(20, 60_000), validateBody(wsSettingsSchema), asyncHandler(async (req, res) => {
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  const { bisonBaseUrl } = req.body as z.infer<typeof wsSettingsSchema>;
  await db.update(workspaces).set({ bisonBaseUrl: bisonBaseUrl || null }).where(eq(workspaces.id, ws.id));
  res.json({ ok: true, bisonBaseUrl: bisonBaseUrl || null });
}));

// ----------------------------------------------------------------- read / sync
/** List our stored campaign definitions for the active workspace. */
outboundRouter.get('/campaigns', asyncHandler(async (req, res) => {
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  const rows = await db.select().from(bisonCampaigns)
    .where(eq(bisonCampaigns.workspaceId, ws.id)).orderBy(desc(bisonCampaigns.id));
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

/** Pull the live campaign list from this workspace's Bison and upsert into our store. */
outboundRouter.post('/sync', rateLimit(10, 60_000), asyncHandler(async (req, res) => {
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  const bison = await bisonClientFor(ws.id);
  const live = await bison.listCampaigns();
  let added = 0, updated = 0;
  for (const lc of live) {
    // Match within this workspace (the same Bison campaign id never spans workspaces).
    const [existing] = await db.select().from(bisonCampaigns)
      .where(and(eq(bisonCampaigns.bisonCampaignId, lc.id), eq(bisonCampaigns.workspaceId, ws.id)));
    if (existing) {
      await db.update(bisonCampaigns).set({ name: lc.name, status: lc.status ?? existing.status, syncedAt: new Date() }).where(eq(bisonCampaigns.id, existing.id));
      updated++;
    } else {
      await db.insert(bisonCampaigns).values({ workspaceId: ws.id, bisonCampaignId: lc.id, name: lc.name, status: lc.status ?? 'created', syncedAt: new Date() });
      added++;
    }
  }
  res.json({ synced: live.length, added, updated });
}));

/** Sender inboxes available in the active workspace (for the builder's sender picker). */
outboundRouter.get('/senders', asyncHandler(async (req, res) => {
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  const bison = await bisonClientFor(ws.id);
  res.json({ senders: await bison.listSenders() });
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
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  const bison = await bisonClientFor(ws.id);

  const created = await bison.createCampaign(b.name);
  if (!created) return err(res, 502, 'Bison: create campaign failed');
  const bisonId = created.id;

  const fails: string[] = [];
  if (b.schedule) { const r = await bison.scheduleCampaign(bisonId, b.schedule as BisonSchedule); if (!r.ok) fails.push(`schedule (${r.status})`); }
  { const r = await bison.setSequenceSteps(bisonId, b.steps as BisonSequenceStep[]); if (!r.ok) fails.push(`sequence-steps (${r.status})`); }
  if (b.senderEmailIds?.length) { const r = await bison.attachSenders(bisonId, b.senderEmailIds); if (!r.ok) fails.push(`attach-senders (${r.status})`); }

  // Persist the definition locally regardless (so a partial build is visible/repairable).
  const [row] = await db.insert(bisonCampaigns).values({
    workspaceId: ws.id, bisonCampaignId: bisonId, name: b.name, status: 'created',
    persona: b.persona ?? ws.persona ?? undefined, subType: b.subType,
    scheduleJson: b.schedule ?? null, limitsJson: b.limits ?? null,
    createdBy: (req as { auth?: { sub?: string } }).auth?.sub ?? null,
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
  const bison = await bisonClientFor(c.workspaceId);
  const r = await bison.resumeCampaign(c.bisonCampaignId);
  if (!r.ok) return err(res, 502, `Bison resume failed (${r.status})`);
  await db.update(bisonCampaigns).set({ status: 'active' }).where(eq(bisonCampaigns.id, c.id));
  res.json({ ok: true, status: 'active' });
}));

outboundRouter.post('/campaigns/:id/pause', rateLimit(10, 60_000), asyncHandler(async (req, res) => {
  const [c] = await db.select().from(bisonCampaigns).where(eq(bisonCampaigns.id, Number(req.params.id)));
  if (!c?.bisonCampaignId) return err(res, 404, 'campaign not created in Bison');
  const bison = await bisonClientFor(c.workspaceId);
  const r = await bison.pauseCampaign(c.bisonCampaignId);
  if (!r.ok) return err(res, 502, `Bison pause failed (${r.status})`);
  await db.update(bisonCampaigns).set({ status: 'paused' }).where(eq(bisonCampaigns.id, c.id));
  res.json({ ok: true, status: 'paused' });
}));

const testSchema = z.object({ email: z.string().email() });
outboundRouter.post('/campaigns/:id/send-test', rateLimit(10, 60_000), validateBody(testSchema), asyncHandler(async (req, res) => {
  const [c] = await db.select().from(bisonCampaigns).where(eq(bisonCampaigns.id, Number(req.params.id)));
  if (!c?.bisonCampaignId) return err(res, 404, 'campaign not created in Bison');
  const bison = await bisonClientFor(c.workspaceId);
  const r = await bison.sendTest(c.bisonCampaignId, (req.body as z.infer<typeof testSchema>).email);
  res.json({ ok: r.ok, status: r.status });
}));

/** Refresh stats from Bison and snapshot them locally (for trend/compare). */
outboundRouter.post('/campaigns/:id/refresh-stats', rateLimit(20, 60_000), asyncHandler(async (req, res) => {
  const [c] = await db.select().from(bisonCampaigns).where(eq(bisonCampaigns.id, Number(req.params.id)));
  if (!c?.bisonCampaignId) return err(res, 404, 'campaign not created in Bison');
  const bison = await bisonClientFor(c.workspaceId);
  const s = await bison.getCampaignStats(c.bisonCampaignId);
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
  // The workspace's persona is the default segment bind; explicit body params narrow it.
  const [ws] = c.workspaceId
    ? await db.select({ persona: workspaces.persona }).from(workspaces).where(eq(workspaces.id, c.workspaceId))
    : [undefined];
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  let aborted = false;
  req.on('close', () => { aborted = true; });
  const send = (event: string, data: unknown) => { if (!aborted && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  try {
    const filter = {
      persona: persona ?? c.persona ?? ws?.persona ?? undefined,
      subType: subType ?? c.subType ?? undefined,
    };
    const result = await pushToBison(c.workspaceId, c.bisonCampaignId, filter, (m) => send('log', { message: m }));
    await db.insert(bisonPushLog).values({
      workspaceId: c.workspaceId, campaignId: c.id, leadsCreated: result.created, leadsAttached: result.attached, segmentFilterJson: filter,
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

const rewriteSchema = z.object({
  emailSubject: z.string().max(300),
  emailBody: z.string().min(1).max(20000),
  action: z.enum(['tighten', 'shorten', 'punch-subject', 'more-greg', 'custom']),
  instruction: z.string().max(500).optional(),
  styleKey: z.string().max(64).optional(),
  persona: z.string().max(64).optional(),
  senderMode: z.enum(['greg', 'edify']).optional(),
  senderName: z.string().max(120).optional(),
});

/**
 * Rewrite a single existing sequence step with Claude (Opus). Returns the edited subject/body
 * the UI swaps in place. Does NOT persist — saving goes through PUT /sequences/:id.
 * Gated on an Anthropic key being configured (DB-first, then env).
 */
outboundRouter.post('/sequences/rewrite-step', rateLimit(20, 60_000), validateBody(rewriteSchema), asyncHandler(async (req, res) => {
  if (!(await isConfiguredAsync())) {
    return err(res, 400, 'Anthropic API key not configured — add it under Settings to rewrite copy.');
  }
  const b = req.body as z.infer<typeof rewriteSchema>;
  try {
    const { result } = await runRewriteStep({
      emailSubject: b.emailSubject, emailBody: b.emailBody,
      action: b.action, instruction: b.instruction,
      senderMode: b.senderMode ?? 'edify', senderName: b.senderName,
      styleKey: b.styleKey, persona: b.persona,
    });
    res.json({ email_subject: result.email_subject, email_body: result.email_body, note: result.note });
  } catch (e) {
    return err(res, 502, `Rewrite failed: ${(e as Error).message}`);
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

outboundRouter.get('/sequences', asyncHandler(async (req, res) => {
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  res.json({
    sequences: await db.select().from(sequenceTemplates)
      .where(eq(sequenceTemplates.workspaceId, ws.id)).orderBy(desc(sequenceTemplates.id)),
  });
}));

outboundRouter.get('/sequences/:id', asyncHandler(async (req, res) => {
  const [s] = await db.select().from(sequenceTemplates).where(eq(sequenceTemplates.id, Number(req.params.id)));
  if (!s) return err(res, 404, 'not found');
  res.json({ sequence: s });
}));

outboundRouter.post('/sequences', rateLimit(20, 60_000), validateBody(seqSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof seqSchema>;
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  const [row] = await db.insert(sequenceTemplates).values({
    workspaceId: ws.id,
    name: b.name, description: b.description, persona: b.persona ?? ws.persona ?? undefined, stepsJson: b.steps,
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

// ----------------------------------------------------------------- experiments (variation testing)
/** List experiments (for the active workspace) with their arms. */
outboundRouter.get('/experiments', asyncHandler(async (req, res) => {
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  const exps = await db.select().from(experiments)
    .where(eq(experiments.workspaceId, ws.id)).orderBy(desc(experiments.id));
  const arms = await db.select().from(experimentArms);
  const byExp = new Map<number, typeof arms>();
  for (const a of arms) { const list = byExp.get(a.experimentId) ?? []; list.push(a); byExp.set(a.experimentId, list); }
  res.json({ experiments: exps.map((e) => ({ ...e, arms: byExp.get(e.id) ?? [] })) });
}));

const armInputSchema = z.object({
  campaignId: z.number().int().positive(),
  label: z.string().max(120).optional(),
  weight: z.number().int().min(0).max(1000).default(1),
  sequenceTemplateId: z.number().int().positive().optional(),
});
const createExpSchema = z.object({
  name: z.string().min(1).max(200),
  persona: z.string().max(64).optional(),
  subType: z.string().max(64).optional(),
  arms: z.array(armInputSchema).min(1).max(50),
});

/** Create an experiment with its arms (each arm = a campaign + weight). */
outboundRouter.post('/experiments', rateLimit(20, 60_000), validateBody(createExpSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof createExpSchema>;
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  const [exp] = await db.insert(experiments).values({
    workspaceId: ws.id, name: b.name, persona: b.persona ?? ws.persona ?? undefined, subType: b.subType,
  }).returning();
  await db.insert(experimentArms).values(b.arms.map((a) => ({
    experimentId: exp.id, campaignId: a.campaignId, label: a.label ?? null,
    weight: a.weight, sequenceTemplateId: a.sequenceTemplateId ?? null,
  })));
  res.json({ id: exp.id });
}));

const updateExpSchema = z.object({
  status: z.enum(['active', 'archived']).optional(),
  // Update weights for existing arms, and/or add new arms.
  armWeights: z.array(z.object({ armId: z.number().int().positive(), weight: z.number().int().min(0).max(1000) })).max(50).optional(),
  addArms: z.array(armInputSchema).max(50).optional(),
});
/** Adjust an experiment: set arm weights (0 = pause), add arms, or archive. */
outboundRouter.patch('/experiments/:id', rateLimit(30, 60_000), validateBody(updateExpSchema), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const b = req.body as z.infer<typeof updateExpSchema>;
  const [exp] = await db.select().from(experiments).where(eq(experiments.id, id));
  if (!exp) return err(res, 404, 'not found');
  if (b.status) await db.update(experiments).set({ status: b.status, updatedAt: new Date() }).where(eq(experiments.id, id));
  for (const w of b.armWeights ?? []) {
    await db.update(experimentArms).set({ weight: w.weight }).where(and(eq(experimentArms.id, w.armId), eq(experimentArms.experimentId, id)));
  }
  if (b.addArms?.length) {
    await db.insert(experimentArms).values(b.addArms.map((a) => ({
      experimentId: id, campaignId: a.campaignId, label: a.label ?? null, weight: a.weight, sequenceTemplateId: a.sequenceTemplateId ?? null,
    })));
  }
  res.json({ ok: true });
}));

/** Preview the allocation: segment size, how many NEW contacts would flow to each arm now. */
outboundRouter.get('/experiments/:id/preview', asyncHandler(async (req, res) => {
  const p = await previewExperiment(Number(req.params.id));
  if (!p) return err(res, 404, 'not found');
  res.json(p);
}));

/** Run the experiment: assign new contacts to arms and push each arm's unsent contacts to Bison. SSE. */
outboundRouter.post('/experiments/:id/push', rateLimit(5, 60_000), validateBody(z.object({ confirm: z.literal(true) })), async (req, res) => {
  const id = Number(req.params.id);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  let aborted = false;
  req.on('close', () => { aborted = true; });
  const send = (event: string, data: unknown) => { if (!aborted && !res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); };
  try {
    const { result } = await runExperimentPush(id, (m) => send('log', { message: m }));
    send('done', result);
  } catch (e) {
    console.error('[outbound/experiments/push]', (e as Error).stack ?? e);
    send('error', { message: `Experiment push failed: ${(e as Error).message}` });
  } finally { if (!res.writableEnded) res.end(); }
});

// ----------------------------------------------------------------- replies / inbox
/** Count of unread positive replies in the active workspace — drives the nav badge. */
outboundRouter.get('/inbox/unread-count', asyncHandler(async (req, res) => {
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(bisonReplies)
    .where(and(eq(bisonReplies.workspaceId, ws.id), eq(bisonReplies.status, 'new'), eq(bisonReplies.isPositive, true)));
  res.json({ count: Number(n) });
}));

/** List replies for the active workspace (positive first, newest first). ?positive=1 to filter. */
outboundRouter.get('/inbox', asyncHandler(async (req, res) => {
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  const positiveOnly = req.query.positive === '1';
  const rows = await db.select().from(bisonReplies)
    .where(and(
      eq(bisonReplies.workspaceId, ws.id),
      positiveOnly ? eq(bisonReplies.isPositive, true) : undefined,
    ))
    .orderBy(desc(bisonReplies.isPositive), desc(bisonReplies.receivedAt)).limit(200);
  res.json({ replies: rows });
}));

/** Pull replies from this workspace's Bison and upsert into our inbox (dedup by bisonReplyId). */
outboundRouter.post('/inbox/sync', rateLimit(20, 60_000), asyncHandler(async (req, res) => {
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  const bison = await bisonClientFor(ws.id);
  const live = await bison.listAllReplies();  // full history; dedup-on-insert makes re-runs safe
  let added = 0;
  for (const r of live) {
    const email = r.lead?.email ?? r.email ?? null;
    const name = [r.lead?.first_name ?? r.first_name, r.lead?.last_name ?? r.last_name].filter(Boolean).join(' ') || null;
    const positive = !!(r.interested || r.is_interested) || /interest|positive/i.test(String(r.sentiment ?? ''));
    const replyId = String(r.id ?? `${email}-${r.created_at ?? r.received_at ?? ''}`);
    const [existing] = await db.select({ id: bisonReplies.id }).from(bisonReplies).where(eq(bisonReplies.bisonReplyId, replyId));
    if (existing) continue;
    // Match the reply to a campaign within THIS workspace (a Bison campaign id is workspace-local).
    const [ourCamp] = r.campaign_id
      ? await db.select({ id: bisonCampaigns.id }).from(bisonCampaigns)
          .where(and(eq(bisonCampaigns.bisonCampaignId, r.campaign_id), eq(bisonCampaigns.workspaceId, ws.id)))
      : [undefined];
    const extReplyId = r.id != null ? String(r.id) : null;
    const senderEmailId = num((r as Record<string, unknown>).sender_email_id ?? (r.sender_email as { id?: unknown } | undefined)?.id);
    const inserted = await db.insert(bisonReplies).values({
      workspaceId: ws.id, campaignId: ourCamp?.id ?? null, bisonCampaignId: r.campaign_id ?? null, bisonReplyId: replyId,
      bisonReplyExtId: extReplyId, senderEmailId,
      leadEmail: email, leadName: name, subject: r.subject ?? null,
      body: r.body ?? r.message ?? r.text ?? null,
      sentiment: r.sentiment ?? (positive ? 'interested' : 'unknown'), isPositive: positive, raw: r,
    }).onConflictDoNothing().returning();
    // Newly-discovered replies notify + sync to HubSpot too (same path as the webhook), so a reply
    // found via manual sync isn't silently skipped. Fire-and-forget; effects isolate their failures.
    if (inserted.length) void onNewReply(inserted[0]);
    added++;
  }
  res.json({ pulled: live.length, added });
}));

/** Mark a reply read/handled, optionally flag interested in Bison. */
const replyActionSchema = z.object({ status: z.enum(['new', 'read', 'claimed', 'replied', 'handled']).optional(), markInterested: z.boolean().optional() });
outboundRouter.post('/inbox/:id/action', rateLimit(60, 60_000), validateBody(replyActionSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof replyActionSchema>;
  const [reply] = await db.select().from(bisonReplies).where(eq(bisonReplies.id, Number(req.params.id)));
  if (!reply) return err(res, 404, 'not found');
  if (b.status) await db.update(bisonReplies).set({ status: b.status }).where(eq(bisonReplies.id, reply.id));
  let interestedOk: boolean | undefined;
  if (b.markInterested && reply.leadEmail) {
    const bison = await bisonClientFor(reply.workspaceId);
    const r = await bison.markInterested(reply.leadEmail, reply.bisonCampaignId ?? undefined);
    interestedOk = r.ok;
    await db.update(bisonReplies).set({ isPositive: true, sentiment: 'interested' }).where(eq(bisonReplies.id, reply.id));
  }
  res.json({ ok: true, interestedOk });
}));

/**
 * Claim a reply — assign it to the current rep so two reps don't both jump on the same lead.
 * Idempotent for the same rep; blocks a different rep (returns who already owns it).
 */
outboundRouter.post('/inbox/:id/claim', rateLimit(60, 60_000), asyncHandler(async (req, res) => {
  const userId = (req as { auth?: { sub?: string } }).auth?.sub ?? null;
  const [reply] = await db.select().from(bisonReplies).where(eq(bisonReplies.id, Number(req.params.id)));
  if (!reply) return err(res, 404, 'not found');
  if (reply.claimedBy && reply.claimedBy !== userId) {
    return res.status(409).json({ error: 'already claimed', claimedBy: reply.claimedBy });
  }
  await db.update(bisonReplies)
    .set({ claimedBy: userId, claimedAt: new Date(), status: reply.status === 'handled' ? 'handled' : 'claimed' })
    .where(eq(bisonReplies.id, reply.id));
  res.json({ ok: true, claimedBy: userId });
}));

/** List this workspace's Bison sender inboxes — the picker for which inbox a reply is sent from. */
outboundRouter.get('/inbox/senders', asyncHandler(async (req, res) => {
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  const bison = await bisonClientFor(ws.id);
  res.json({ senders: await bison.listSenders() });
}));

/**
 * Reply to a lead THROUGH Bison (threaded on the original) from a chosen sender inbox — so the rep
 * never needs the rotating mailbox. Requires the Bison reply id; without it, the UI falls back to
 * the Bison unibox deep-link. On success the reply is marked 'replied'.
 */
const replySendSchema = z.object({
  message: z.string().min(1).max(20000),
  senderEmailId: z.number().int().positive().optional(),
  contentType: z.enum(['html', 'text']).optional(),
});
outboundRouter.post('/inbox/:id/reply', rateLimit(30, 60_000), validateBody(replySendSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof replySendSchema>;
  const [reply] = await db.select().from(bisonReplies).where(eq(bisonReplies.id, Number(req.params.id)));
  if (!reply) return err(res, 404, 'not found');
  if (!reply.bisonReplyExtId) return err(res, 422, 'no Bison reply id on this record — open it in Bison to respond');
  if (!reply.leadEmail) return err(res, 422, 'no lead email on this record');
  const senderEmailId = b.senderEmailId ?? reply.senderEmailId;
  if (!senderEmailId) return err(res, 422, 'no sender inbox known — pick one to reply from');

  const bison = await bisonClientFor(reply.workspaceId);
  const resp = await bison.sendReply(reply.bisonReplyExtId, {
    message: b.message,
    sender_email_id: senderEmailId,
    to_emails: [{ name: reply.leadName ?? undefined, email_address: reply.leadEmail }],
    content_type: b.contentType ?? 'html',
    inject_previous_email_body: true,
  });
  if (!resp.ok) return err(res, 502, `Bison reply failed (${resp.status})`);
  await db.update(bisonReplies).set({ status: 'replied' }).where(eq(bisonReplies.id, reply.id));
  res.json({ ok: true });
}));

// ----------------------------------------------------------------- reply routing (round-robin rosters)
/**
 * List the reply-notification rosters relevant to the active workspace: this workspace's roster
 * and any per-campaign overrides. There is no global roster — each workspace owns its own. The
 * Google Chat space falls back to the shared default secret (GOOGLE_CHAT_WEBHOOK_URL) when a roster
 * sets no override; that default is managed on Settings, not here.
 */
outboundRouter.get('/notify-routes', asyncHandler(async (req, res) => {
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  const rows = await db.select().from(notifyRoutes);
  const workspace = rows.find((r) => r.workspaceId === ws.id && r.campaignId === null) ?? null;
  const campaigns = rows.filter((r) => r.campaignId !== null);
  res.json({ workspaceId: ws.id, workspace, campaigns });
}));

const routeSchema = z.object({
  scope: z.enum(['workspace', 'campaign']),
  campaignId: z.number().int().positive().optional(),  // required when scope === 'campaign'
  reps: z.array(z.string().trim().min(1).max(120)).max(50),
  webhookUrlOverride: z.string().trim().url().max(500).nullable().optional(),
});
/** Upsert a roster for a scope (workspace or campaign). Resets the round-robin cursor when the roster changes. */
outboundRouter.put('/notify-routes', rateLimit(30, 60_000), validateBody(routeSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof routeSchema>;
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  if (b.scope === 'campaign' && !b.campaignId) return err(res, 400, 'campaignId required for campaign scope');

  const workspaceId = b.scope === 'workspace' ? ws.id : null;
  const campaignId = b.scope === 'campaign' ? b.campaignId! : null;
  const match = campaignId != null
    ? eq(notifyRoutes.campaignId, campaignId)
    : and(eq(notifyRoutes.workspaceId, workspaceId!), isNull(notifyRoutes.campaignId));

  const [existing] = await db.select().from(notifyRoutes).where(match);
  const values = { workspaceId, campaignId, reps: b.reps, webhookUrlOverride: b.webhookUrlOverride ?? null, rrCursor: 0, updatedAt: new Date() };
  const [row] = existing
    ? await db.update(notifyRoutes).set(values).where(eq(notifyRoutes.id, existing.id)).returning()
    : await db.insert(notifyRoutes).values(values).returning();
  res.json({ ok: true, route: row });
}));

// ----------------------------------------------------------------- performance (cross-campaign)
/** Latest stats snapshot per campaign + derived rates (active workspace), for the comparison view. */
outboundRouter.get('/performance', asyncHandler(async (req, res) => {
  const ws = await resolveWorkspace(req);
  if (!ws) return err(res, 400, 'unknown workspace');
  const camps = await db.select().from(bisonCampaigns)
    .where(eq(bisonCampaigns.workspaceId, ws.id)).orderBy(desc(bisonCampaigns.id));
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
