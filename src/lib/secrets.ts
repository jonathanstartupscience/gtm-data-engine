/**
 * Runtime secret store. Lets API keys be set from the app (saved encrypted in app_settings)
 * instead of only via Railway env vars. Resolution order for any key:
 *   1. app_settings (DB, encrypted at rest)  — set/rotated from the in-app Settings page
 *   2. process.env fallback                   — the original Railway env var
 *
 * Encryption: AES-256-GCM with a key derived from APP_ENCRYPTION_KEY. If that env var is unset,
 * we refuse to STORE secrets (the page tells the user to set it) but env-var fallback still works,
 * so the app keeps functioning exactly as before.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { appSettings } from '../db/schema.js';

/** Map of logical setting key → the env var it falls back to. */
export const SECRET_ENV: Record<string, string> = {
  HEYREACH_API_KEY: 'HEYREACH_API_KEY',
  EMAILBISON_API_KEY: 'EMAILBISON_API_KEY',
  EMAILBISON_BASE_URL: 'EMAILBISON_BASE_URL',
  HUBSPOT_TOKEN: 'HUBSPOT_TOKEN',
  BOUNCER_API_KEY: 'BOUNCER_API_KEY',
  AIRSCALE_API_KEY: 'AIRSCALE_API_KEY',
  OCEAN_API_KEY: 'OCEAN_API_KEY',
  ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
  GOOGLE_CHAT_WEBHOOK_URL: 'GOOGLE_CHAT_WEBHOOK_URL', // default shared space for reply alerts
};

function encKey(): Buffer | null {
  const raw = (process.env.APP_ENCRYPTION_KEY ?? '').trim();
  if (!raw) return null;
  // Derive a stable 32-byte key from whatever the user set (any length).
  return createHash('sha256').update(raw).digest();
}

export function canStoreSecrets(): boolean { return encKey() !== null; }

function encrypt(plain: string): string {
  const key = encKey();
  if (!key) throw new Error('APP_ENCRYPTION_KEY not set — cannot store secrets');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // store iv:tag:ciphertext, all base64
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

function decrypt(stored: string): string | null {
  const key = encKey();
  if (!key) return null;
  const [ivB, tagB, ctB] = stored.split(':');
  if (!ivB || !tagB || !ctB) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB, 'base64')), decipher.final()]).toString('utf8');
  } catch { return null; }
}

// Small in-memory cache so we don't hit the DB on every adapter call. Invalidated on set/clear.
const cache = new Map<string, string | null>();

/**
 * Resolve the Email Bison API key for a workspace. Each workspace authenticates as ITSELF —
 * its key lives under `EMAILBISON_API_KEY__<slug>` (set on the Workspaces page or via env).
 * There is no global/account-wide Bison key: Bison has no shared sending identity, so a workspace
 * with no key of its own simply cannot send (callers see an empty key and fail clearly). Returns ''
 * when the slug is missing or the workspace has no key.
 */
export async function bisonKeyFor(slug?: string): Promise<string> {
  if (!slug) return '';
  return getSecret(`EMAILBISON_API_KEY__${slug}`);
}

/** Resolve the Email Bison base URL for a workspace (per-workspace override → global → default). */
export async function bisonBaseFor(baseOverride?: string | null): Promise<string> {
  if (baseOverride) return baseOverride;
  const fromSecret = await getSecret('EMAILBISON_BASE_URL');
  return fromSecret || 'https://dedi.emailbison.com/api';
}

/** Resolve a secret: DB (decrypted) first, then env var. Returns '' if neither. Async. */
export async function getSecret(name: string): Promise<string> {
  if (cache.has(name)) return cache.get(name) ?? '';
  let value = '';
  try {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, name));
    if (row?.valueEnc) value = decrypt(row.valueEnc) ?? '';
  } catch { /* table may not exist yet during first boot — fall through to env */ }
  if (!value) value = (process.env[SECRET_ENV[name] ?? name] ?? '').trim();
  cache.set(name, value);
  return value;
}

/** Synchronous best-effort read for hot paths: cache → env. (DB value is loaded by warmSecrets.) */
export function getSecretSync(name: string): string {
  if (cache.has(name)) return cache.get(name) ?? '';
  return (process.env[SECRET_ENV[name] ?? name] ?? '').trim();
}

/** Preload all known secrets into the cache (call once at boot, after DB is reachable). */
export async function warmSecrets(): Promise<void> {
  for (const name of Object.keys(SECRET_ENV)) await getSecret(name);
}

/** Save (encrypt) a secret to the DB and refresh the cache. */
export async function setSecret(name: string, value: string, by?: string): Promise<void> {
  const valueEnc = encrypt(value);
  await db.insert(appSettings).values({ key: name, valueEnc, updatedBy: by ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { valueEnc, updatedBy: by ?? null, updatedAt: new Date() } });
  cache.set(name, value);
}

/** Remove a DB-stored secret (falls back to env var afterward). */
export async function clearSecret(name: string): Promise<void> {
  await db.delete(appSettings).where(eq(appSettings.key, name));
  cache.delete(name);
}

/** Where a secret currently resolves from + a masked preview — for the Settings UI (never the raw value). */
export async function secretStatus(name: string): Promise<{ set: boolean; source: 'db' | 'env' | 'none'; masked: string }> {
  let source: 'db' | 'env' | 'none' = 'none';
  let value = '';
  try {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, name));
    if (row?.valueEnc) { const d = decrypt(row.valueEnc); if (d) { value = d; source = 'db'; } }
  } catch { /* ignore */ }
  if (!value) { const env = (process.env[SECRET_ENV[name] ?? name] ?? '').trim(); if (env) { value = env; source = 'env'; } }
  const masked = value ? `${value.slice(0, 3)}…${value.slice(-4)}` : '';
  return { set: !!value, source, masked };
}
