/**
 * Clerk auth middleware — verifies the caller's Clerk session JWT against the
 * instance JWKS using `jose`. Matches the secret-less pattern used across our
 * internal apps (ss-website-builder/api/_auth.js). Env-driven:
 *   CLERK_JWKS_URL — https://<instance>.clerk.accounts.dev/.well-known/jwks.json
 * If CLERK_JWKS_URL is unset, auth is SKIPPED (open) — so the app works before
 * keys are wired, and gating activates automatically once the env var is set.
 */
import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwksUrl = (process.env.CLERK_JWKS_URL ?? '').trim();
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks && jwksUrl) jwks = createRemoteJWKSet(new URL(jwksUrl));
  return jwks;
}

export const authConfigured = () => !!jwksUrl;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { auth?: { sub: string; claims: Record<string, unknown> }; }
  }
}

/** Require a valid Clerk session. No-op (open) when CLERK_JWKS_URL is unset. */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!jwksUrl) return next(); // unconfigured → open (dev / pre-keys)
  const header = req.headers.authorization ?? '';
  // EventSource (SSE) can't set headers, so also accept ?token= for those endpoints.
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : (typeof req.query.token === 'string' ? req.query.token : null);
  if (!token) { res.status(401).json({ error: 'Missing session token' }); return; }
  try {
    const set = getJwks()!;
    const { payload } = await jwtVerify(token, set);
    req.auth = { sub: String(payload.sub), claims: payload as Record<string, unknown> };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}
