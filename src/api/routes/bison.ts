/** Email Bison API: list campaigns, preview a segment count, push (confirm + SSE). */
import { Router } from 'express';
import { z } from 'zod';
import { listCampaigns } from '../../engine/adapters/emailbison.js';
import { segmentCount } from '../../engine/stages/activate.js';
import { runPushToBison } from '../../engine/recipes.js';
import { asyncHandler } from '../middleware.js';
import { rateLimit, validateBody } from '../validate.js';

export const bisonRouter = Router();

/** Campaigns in the workspace (for the selector). */
bisonRouter.get('/campaigns', asyncHandler(async (_req, res) => {
  res.json({ campaigns: await listCampaigns() });
}));

/** Preview how many campaign-ready contacts a filter would send. No send. */
bisonRouter.get('/segment-count', asyncHandler(async (req, res) => {
  const persona = req.query.persona ? String(req.query.persona).slice(0, 64) : undefined;
  const subType = req.query.subType ? String(req.query.subType).slice(0, 64) : undefined;
  res.json({ count: await segmentCount({ persona, subType }) });
}));

const pushSchema = z.object({
  confirm: z.literal(true),
  campaignId: z.number().int().positive(),
  persona: z.string().max(64).optional(),
  subType: z.string().max(64).optional(),
});

/** Execute the push — REQUIRES { confirm: true }. SSE progress. */
bisonRouter.post('/push', rateLimit(5, 60_000), validateBody(pushSchema), async (req, res) => {
  const { campaignId, persona, subType } = req.body as z.infer<typeof pushSchema>;
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
    const result = await runPushToBison(campaignId, { persona, subType }, (m) => send('log', { message: m }));
    send('done', result);
  } catch (err) {
    console.error('[bison/push] error:', (err as Error).stack ?? err);
    send('error', { message: 'Push failed — see server logs' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});
