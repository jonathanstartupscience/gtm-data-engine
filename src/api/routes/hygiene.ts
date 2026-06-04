/** Data Hygiene API: analytics (gaps + candidate counts, $0) + run free hygiene tasks (SSE). */
import { Router } from 'express';
import { and, count, eq, isNull, isNotNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies, contacts, contactCompany, runs } from '../../db/schema.js';
import { startRun, finishRun, StepRecorder } from '../../engine/runs.js';
import {
  analyzeAssociationRepair, runAssociationRepair,
  analyzePersonaBackfill, runPersonaBackfill,
  analyzeNormalize, runNormalize,
  analyzePairing, runPairing,
} from '../../engine/stages/hygiene.js';
import { asyncHandler } from '../middleware.js';
import { rateLimit } from '../validate.js';

export const hygieneRouter = Router();

/** Data-health analytics: overall fill rates + per-task candidate counts (all $0 to compute). */
hygieneRouter.get('/analytics', asyncHandler(async (_req, res) => {
  const [[co], [ct]] = await Promise.all([
    db.select({ n: count() }).from(companies), db.select({ n: count() }).from(contacts),
  ]);
  const [coStats] = await db.select({
    typed: sql<number>`count(*) filter (where type is not null and type<>'')::int`,
    domain: sql<number>`count(*) filter (where domain is not null and domain<>'')::int`,
    sized: sql<number>`count(*) filter (where size_employees is not null and size_employees<>'')::int`,
  }).from(companies);
  const [ctStats] = await db.select({
    persona: sql<number>`count(*) filter (where persona is not null and persona<>'')::int`,
    verified: sql<number>`count(*) filter (where email_status is not null and email_status<>'')::int`,
    title: sql<number>`count(*) filter (where job_title is not null and job_title<>'')::int`,
  }).from(contacts);
  const [{ orphans }] = await db.select({ orphans: sql<number>`count(*)::int` })
    .from(contacts).leftJoin(contactCompany, eq(contactCompany.contactId, contacts.id))
    .where(isNull(contactCompany.id));

  const [assoc, persona, norm, pairing] = await Promise.all([
    analyzeAssociationRepair(), analyzePersonaBackfill(), analyzeNormalize(), analyzePairing(),
  ]);

  res.json({
    companies: { total: co.n, typed: coStats.typed, withDomain: coStats.domain, withSize: coStats.sized },
    contacts: { total: ct.n, withPersona: ctStats.persona, verified: ctStats.verified, withTitle: ctStats.title, orphans },
    tasks: {
      pairing: { candidates: pairing.candidates, free: true, note: `${pairing.bothMissing.toLocaleString()} companies missing both Type & Sub-type → AI Classify` },
      associationRepair: { candidates: assoc.candidates, free: true },
      personaBackfill: { candidates: persona.candidates, free: true },
      normalize: { candidates: norm.candidates, free: true },
    },
  });
}));

const TASKS: Record<string, (log: (m: string) => void) => Promise<Record<string, number>>> = {
  'pairing': (log) => runPairing(log),
  'association-repair': (log) => runAssociationRepair(log),
  'persona-backfill': (log) => runPersonaBackfill(log),
  'normalize': (log) => runNormalize(log),
};

/** Run a free hygiene task with SSE progress. */
hygieneRouter.get('/run/:task', rateLimit(10, 60_000), async (req, res) => {
  const task = String(req.params.task);
  if (!(task in TASKS)) { res.status(404).json({ error: 'Unknown task' }); return; }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  let aborted = false;
  req.on('close', () => { aborted = true; });
  const send = (event: string, data: unknown) => {
    if (aborted || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const runId = await startRun(`hygiene-${task}`);
  const rec = new StepRecorder((m) => send('log', { message: m }));
  try {
    rec.step({ provider: 'Engine', status: 'info', label: `Running ${task} (free)` });
    const stats = await TASKS[task]((m) => rec.step({ provider: 'Engine', status: 'ok', label: m }));
    await finishRun(runId, 'done', stats, rec.steps);
    send('done', { runId, stats });
  } catch (err) {
    rec.step({ provider: 'Engine', status: 'error', label: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
    send('error', { message: 'Task failed — see server logs' });
    console.error(`[hygiene/${task}]`, (err as Error).stack ?? err);
  } finally {
    if (!res.writableEnded) res.end();
  }
  void and; void ne; void or; void isNotNull; void runs;
});
