/** Email Bison API (legacy /api/bison): list campaigns, preview a segment count, push (confirm + SSE).
 *  Workspace-aware — the UI sends ?workspace=<slug> (or x-workspace header); defaults to ESO. */
import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { workspaces, bisonCampaigns } from '../../db/schema.js';
import { bisonClientFor } from '../../engine/adapters/emailbison.js';
import { segmentCount } from '../../engine/stages/activate.js';
import { runPushToBison } from '../../engine/recipes.js';
import { asyncHandler } from '../middleware.js';
import { rateLimit, validateBody } from '../validate.js';

export const bisonRouter = Router();

/** Resolve the active workspace from ?workspace / x-workspace (default ESO). */
async function resolveWorkspace(req: import('express').Request) {
  const slug = String(req.query.workspace ?? req.header('x-workspace') ?? '').trim() || 'eso';
  const [w] = await db.select().from(workspaces).where(eq(workspaces.slug, slug));
  return w ?? null;
}

/** Campaigns in the active workspace (for the selector). */
bisonRouter.get('/campaigns', asyncHandler(async (req, res) => {
  const ws = await resolveWorkspace(req);
  if (!ws) return res.status(400).json({ error: 'unknown workspace' });
  const bison = await bisonClientFor(ws.id);
  res.json({ campaigns: await bison.listCampaigns() });
}));

/** Preview how many campaign-ready contacts a filter would send. No send. */
bisonRouter.get('/segment-count', asyncHandler(async (req, res) => {
  const persona = req.query.persona ? String(req.query.persona).slice(0, 64) : undefined;
  const subType = req.query.subType ? String(req.query.subType).slice(0, 64) : undefined;
  res.json({ count: await segmentCount({ persona, subType }) });
}));

const pushSchema = z.object({
  confirm: z.literal(true),
  campaignId: z.number().int().positive(),   // our bison_campaigns.id
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
    const [c] = await db.select().from(bisonCampaigns).where(eq(bisonCampaigns.id, campaignId));
    if (!c?.bisonCampaignId) { send('error', { message: 'campaign not created in Bison' }); return; }
    const result = await runPushToBison(c.workspaceId, c.bisonCampaignId, { persona, subType }, (m) => send('log', { message: m }));
    send('done', result);
  } catch (err) {
    console.error('[bison/push] error:', (err as Error).stack ?? err);
    send('error', { message: 'Push failed — see server logs' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});
