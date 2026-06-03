/** HubSpot push API: preview (no writes) → confirm → execute. Writes only on explicit confirm. */
import { Router } from 'express';
import { z } from 'zod';
import { runPushPreview, runPushExecute } from '../../engine/recipes.js';
import { asyncHandler } from '../middleware.js';
import { rateLimit, validateBody } from '../validate.js';

export const pushRouter = Router();

/** Preview what pushing to HubSpot would change. NO writes. */
pushRouter.post('/preview', rateLimit(10, 60_000), asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number((req.body as { limit?: number }).limit) || 2000, 1), 10_000);
  const preview = await runPushPreview({ limit });
  res.json(preview);
}));

const executeSchema = z.object({ confirm: z.literal(true), limit: z.number().int().min(1).max(10_000).optional() });

/** Execute the push — REQUIRES { confirm: true }. Streams progress via SSE. */
pushRouter.post('/execute', rateLimit(5, 60_000), validateBody(executeSchema), async (req, res) => {
  const { limit } = req.body as z.infer<typeof executeSchema>;
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
  try {
    const result = await runPushExecute({ limit }, (m) => send('log', { message: m }));
    send('done', result);
  } catch (err) {
    console.error('[push/execute] error:', (err as Error).stack ?? err);
    send('error', { message: 'Push failed — see server logs' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});
