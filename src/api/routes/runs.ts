/** Recipe execution API: trigger a recipe with SSE live progress + list run history. */
import { Router } from 'express';
import { desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { runs } from '../../db/schema.js';
import { runVerifyStale, runEnrichCompanies } from '../../engine/recipes.js';
import { asyncHandler } from '../middleware.js';
import { rateLimit } from '../validate.js';

export const runsRouter = Router();

const KNOWN_RECIPES = new Set(['verify-stale', 'enrich-companies']);

/** List recent runs (history table). */
runsRouter.get('/', asyncHandler(async (_req, res) => {
  const rows = await db.select().from(runs).orderBy(desc(runs.id)).limit(50);
  res.json({ rows });
}));

/**
 * Trigger a recipe and stream progress as Server-Sent Events.
 * GET /api/runs/stream/:recipe?dryRun=1  (EventSource-friendly; GET so the browser can stream)
 */
runsRouter.get('/stream/:recipe', rateLimit(10, 60_000), async (req, res) => {
  const recipe = String(req.params.recipe);
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const limit = req.query.limit ? Math.min(Math.max(Number(req.query.limit) || 0, 0), 500_000) : undefined;

  if (!KNOWN_RECIPES.has(recipe)) { res.status(404).json({ error: 'Unknown recipe' }); return; }

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
  const log = (m: string) => send('log', { message: m });

  try {
    const result = recipe === 'enrich-companies'
      ? await runEnrichCompanies({ dryRun, limit }, log)
      : await runVerifyStale({ dryRun, limit }, log);
    send('done', result);
  } catch (err) {
    console.error('[runs/stream] error:', (err as Error).stack ?? err);
    send('error', { message: 'Run failed — see server logs' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});
