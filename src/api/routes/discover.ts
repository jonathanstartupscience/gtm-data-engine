/** Discovery API: suggest seed companies + run lookalike discovery (SSE). Type/Sub-type aware. */
import { Router } from 'express';
import { z } from 'zod';
import { suggestSeeds } from '../../engine/stages/discover.js';
import { runDiscoverLookalikes } from '../../engine/recipes.js';
import { asyncHandler } from '../middleware.js';
import { rateLimit, validateBody } from '../validate.js';

export const discoverRouter = Router();

/** Suggest seed companies to find lookalikes of, filtered by type + sub-type. */
discoverRouter.get('/seeds', asyncHandler(async (req, res) => {
  const type = req.query.type ? String(req.query.type).slice(0, 64) : undefined;
  const subType = req.query.subType ? String(req.query.subType).slice(0, 64) : undefined;
  const seeds = await suggestSeeds({ type, subType }, 12);
  res.json({ seeds });
}));

const discoverSchema = z.object({
  seedDomains: z.array(z.string().max(255)).min(1).max(50),
  type: z.string().max(64).optional(),
  subType: z.string().max(64).optional(),
  size: z.number().int().min(1).max(500).optional(),
});

/** Run lookalike discovery with SSE progress. */
discoverRouter.post('/run', rateLimit(10, 60_000), validateBody(discoverSchema), async (req, res) => {
  const { seedDomains, type, subType, size } = req.body as z.infer<typeof discoverSchema>;
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
    const result = await runDiscoverLookalikes({ seedDomains, type, subType, size }, (m) => send('log', { message: m }));
    send('done', result);
  } catch (err) {
    console.error('[discover/run] error:', (err as Error).stack ?? err);
    send('error', { message: 'Discovery failed — see server logs' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});
