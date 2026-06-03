/** Discovery API: suggest seed companies, list sub-types, and run lookalike discovery (SSE). */
import { Router } from 'express';
import { z } from 'zod';
import { desc, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies } from '../../db/schema.js';
import { suggestSeeds } from '../../engine/stages/discover.js';
import { runDiscoverLookalikes } from '../../engine/recipes.js';
import { asyncHandler } from '../middleware.js';
import { rateLimit, validateBody } from '../validate.js';

export const discoverRouter = Router();

/** Distinct sub-types in the store (for the "what kind to find" picker). */
discoverRouter.get('/subtypes', asyncHandler(async (_req, res) => {
  const rows = await db.select({ sub: companies.subType, n: sql<number>`count(*)::int` })
    .from(companies).groupBy(companies.subType).orderBy(desc(sql`count(*)`));
  res.json({ subTypes: rows.filter((r) => r.sub) });
}));

/** Suggest seed companies (optionally filtered by sub-type) to find lookalikes of. */
discoverRouter.get('/seeds', asyncHandler(async (req, res) => {
  const subType = req.query.subType ? String(req.query.subType).slice(0, 64) : undefined;
  const seeds = await suggestSeeds(subType, 12);
  res.json({ seeds });
}));

const discoverSchema = z.object({
  seedDomains: z.array(z.string().max(255)).min(1).max(50),
  subType: z.string().max(64).optional(),
  size: z.number().int().min(1).max(500).optional(),
});

/** Run lookalike discovery with SSE progress. */
discoverRouter.post('/run', rateLimit(10, 60_000), validateBody(discoverSchema), async (req, res) => {
  const { seedDomains, subType, size } = req.body as z.infer<typeof discoverSchema>;
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
    const result = await runDiscoverLookalikes({ seedDomains, subType, size }, (m) => send('log', { message: m }));
    send('done', result);
  } catch (err) {
    console.error('[discover/run] error:', (err as Error).stack ?? err);
    send('error', { message: 'Discovery failed — see server logs' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});
