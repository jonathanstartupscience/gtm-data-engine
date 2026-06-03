/** Recipe execution API: trigger a recipe with SSE live progress + list run history. */
import { Router } from 'express';
import { desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { runs } from '../../db/schema.js';
import { runVerifyStale } from '../../engine/recipes.js';

export const runsRouter = Router();

/** List recent runs (history table). */
runsRouter.get('/', async (_req, res) => {
  const rows = await db.select().from(runs).orderBy(desc(runs.id)).limit(50);
  res.json({ rows });
});

/**
 * Trigger a recipe and stream progress as Server-Sent Events.
 * GET /api/runs/stream/:recipe?dryRun=1  (EventSource-friendly; GET so the browser can stream)
 */
runsRouter.get('/stream/:recipe', async (req, res) => {
  const recipe = req.params.recipe;
  const dryRun = req.query.dryRun === '1' || req.query.dryRun === 'true';
  const limit = req.query.limit ? Number(req.query.limit) : undefined;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  const log = (m: string) => send('log', { message: m });

  try {
    let result;
    switch (recipe) {
      case 'verify-stale':
        result = await runVerifyStale({ dryRun, limit }, log);
        break;
      default:
        send('error', { message: `Unknown recipe: ${recipe}` });
        return res.end();
    }
    send('done', result);
  } catch (err) {
    send('error', { message: (err as Error).message });
  } finally {
    res.end();
  }
});
