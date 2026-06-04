/**
 * In-app Settings — manage vendor API keys at runtime (stored encrypted in app_settings),
 * so a key can be added/rotated WITHOUT a Railway env edit + redeploy. Keys are never returned
 * in full (masked preview only). Resolution is DB-first then env (see lib/secrets.ts).
 */
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware.js';
import { rateLimit, validateBody } from '../validate.js';
import { secretStatus, setSecret, clearSecret, canStoreSecrets } from '../../lib/secrets.js';
import { checkApiKey as heyreachCheck } from '../../engine/adapters/heyreach.js';

export const settingsRouter = Router();

// Keys this page can manage today. (The store supports more — see SECRET_ENV — we expose HeyReach now.)
const MANAGED = [
  { key: 'HEYREACH_API_KEY', label: 'HeyReach API key', help: 'HeyReach → Settings → API. Enables the LinkedIn Engine.', testable: true },
];

/** Status of each managed key: whether set, where it resolves from, masked preview. */
settingsRouter.get('/', asyncHandler(async (_req, res) => {
  const keys = await Promise.all(MANAGED.map(async (m) => ({ ...m, ...(await secretStatus(m.key)) })));
  res.json({ canStore: canStoreSecrets(), keys });
}));

const setSchema = z.object({ key: z.enum(['HEYREACH_API_KEY']), value: z.string().min(8).max(500) });
settingsRouter.post('/', rateLimit(20, 60_000), validateBody(setSchema), asyncHandler(async (req, res) => {
  if (!canStoreSecrets()) {
    res.status(400).json({ error: 'APP_ENCRYPTION_KEY is not set on the server, so keys can’t be stored securely. Add it in Railway once, then keys can be managed here.' });
    return;
  }
  const { key, value } = req.body as z.infer<typeof setSchema>;
  const userId = (req as { auth?: { sub?: string } }).auth?.sub;
  await setSecret(key, value.trim(), userId);
  res.json({ ok: true, ...(await secretStatus(key)) });
}));

const keyParam = z.object({ key: z.enum(['HEYREACH_API_KEY']) });
settingsRouter.delete('/:key', rateLimit(20, 60_000), asyncHandler(async (req, res) => {
  const parsed = keyParam.safeParse({ key: req.params.key });
  if (!parsed.success) { res.status(400).json({ error: 'unknown key' }); return; }
  await clearSecret(parsed.data.key);
  res.json({ ok: true, ...(await secretStatus(parsed.data.key)) });
}));

/** Test a key live (currently HeyReach). Uses whatever is resolved (DB or env). */
settingsRouter.post('/:key/test', rateLimit(20, 60_000), asyncHandler(async (req, res) => {
  if (req.params.key === 'HEYREACH_API_KEY') {
    const r = await heyreachCheck();
    res.json({ ok: r.ok, status: r.status, detail: r.ok ? 'Key valid' : r.status === 0 ? 'No key set' : `HeyReach returned ${r.status}` });
    return;
  }
  res.status(400).json({ error: 'no live test for this key' });
}));
