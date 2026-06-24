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

// Fixed keys this page can manage. (The store supports more — see SECRET_ENV.)
const MANAGED = [
  { key: 'HEYREACH_API_KEY', label: 'HeyReach API key', help: 'HeyReach → Settings → API. Enables the LinkedIn Engine.', testable: true },
  { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API key', help: 'console.anthropic.com → API keys. Enables running the AI classifier from the app (Classify tab).', testable: false },
  { key: 'GOOGLE_CHAT_WEBHOOK_URL', label: 'Google Chat webhook (reply alerts)', help: 'Google Chat space → Apps & integrations → Webhooks → copy URL. Reply notifications post here; channel membership controls who is alerted.', testable: false },
  { key: 'EMAILBISON_API_KEY', label: 'Email Bison API key (global / fallback)', help: 'Email Bison → workspace → API. Used by any Email-Engine workspace that has no key of its own.', testable: false },
];

/**
 * Is this a valid managed key? (fixed list OR a per-workspace Bison key)
 * The per-workspace Bison keys (EMAILBISON_API_KEY__<slug>) are NOT listed on this global page —
 * they are managed contextually on the Email-Engine Workspaces page (/email/workspaces) — but they
 * remain settable/clearable through these same endpoints, so the regex stays in the allow-list.
 */
function isManagedKey(key: string): boolean {
  return MANAGED.some((m) => m.key === key) || /^EMAILBISON_API_KEY__[a-z0-9-]{1,40}$/.test(key);
}

/** Status of each managed key: whether set, where it resolves from, masked preview. */
settingsRouter.get('/', asyncHandler(async (_req, res) => {
  const keys = await Promise.all(MANAGED.map(async (m) => ({ ...m, ...(await secretStatus(m.key)) })));
  res.json({ canStore: canStoreSecrets(), keys });
}));

const setSchema = z.object({ key: z.string().min(1).max(80), value: z.string().min(8).max(500) });
settingsRouter.post('/', rateLimit(20, 60_000), validateBody(setSchema), asyncHandler(async (req, res) => {
  if (!canStoreSecrets()) {
    res.status(400).json({ error: 'APP_ENCRYPTION_KEY is not set on the server, so keys can’t be stored securely. Add it in Railway once, then keys can be managed here.' });
    return;
  }
  const { key, value } = req.body as z.infer<typeof setSchema>;
  if (!isManagedKey(key)) { res.status(400).json({ error: 'unknown key' }); return; }
  const userId = (req as { auth?: { sub?: string } }).auth?.sub;
  await setSecret(key, value.trim(), userId);
  res.json({ ok: true, ...(await secretStatus(key)) });
}));

settingsRouter.delete('/:key', rateLimit(20, 60_000), asyncHandler(async (req, res) => {
  const key = String(req.params.key);
  if (!isManagedKey(key)) { res.status(400).json({ error: 'unknown key' }); return; }
  await clearSecret(key);
  res.json({ ok: true, ...(await secretStatus(key)) });
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
