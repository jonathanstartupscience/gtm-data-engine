/**
 * Clerk auth middleware — verifies the caller's Clerk session JWT against the
 * instance JWKS using `jose`. Matches the secret-less pattern used across our
 * internal apps. Env-driven:
 *   CLERK_JWKS_URL — https://<instance>.clerk.accounts.dev/.well-known/jwks.json
 *   CLERK_ALLOWED_ORIGINS — comma-separated allowed `azp` values (this app's origins)
 *
 * Fail-open ONLY in non-production. In production, a missing JWKS URL refuses to
 * start (see assertAuthSafe) so a typo can't silently expose PII.
 *
 * SERVICE TOKEN (machine callers — Claude Code, scripts, automation): an optional
 * high-privilege shared secret in env `API_SERVICE_TOKEN`. When set, a request
 * carrying it (Authorization: Bearer <token> OR X-Service-Token: <token>) is
 * authenticated as the synthetic "service" principal, bypassing Clerk. This is
 * ADDITIVE: it never weakens the Clerk path for browser traffic. Env-only by
 * design (it is the credential that grants API access, so it must not live behind
 * the app's own DB secret layer). Must be long (>= 24 chars) to be honored.
 */
import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwksUrl = (process.env.CLERK_JWKS_URL ?? '').trim();
const allowedAzp = (process.env.CLERK_ALLOWED_ORIGINS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Service token — only honored when present AND sufficiently long (a short/empty
// env var must never become an accidental backdoor).
const serviceToken = (process.env.API_SERVICE_TOKEN ?? '').trim();
const serviceTokenEnabled = serviceToken.length >= 24;

/** Constant-time string compare (avoids leaking match length/position via timing). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Extract a candidate service token from the request headers, if any. */
function serviceTokenFromReq(req: Request): string | null {
  const x = req.headers['x-service-token'];
  if (typeof x === 'string' && x) return x;
  const auth = req.headers.authorization ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!jwks && jwksUrl) jwks = createRemoteJWKSet(new URL(jwksUrl));
  return jwks;
}

export const authConfigured = () => !!jwksUrl;

/** Refuse to boot in production if auth isn't configured (fail closed). */
export function assertAuthSafe(): void {
  if (process.env.NODE_ENV === 'production' && !jwksUrl) {
    throw new Error(
      'FATAL: NODE_ENV=production but CLERK_JWKS_URL is unset — refusing to start with auth OPEN. ' +
      'Set CLERK_JWKS_URL (and VITE_CLERK_PUBLISHABLE_KEY for the frontend).',
    );
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { auth?: { sub: string; claims: Record<string, unknown> }; }
  }
}

export const serviceAuthEnabled = () => serviceTokenEnabled;

/** Require a valid Clerk session OR the service token. Open only when CLERK_JWKS_URL is unset (dev). */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Service token first (machine callers). Only a *matching* token short-circuits;
  // a non-matching Bearer value falls through to the Clerk path below (so Clerk JWTs
  // carried as Bearer still verify normally).
  if (serviceTokenEnabled) {
    const candidate = serviceTokenFromReq(req);
    if (candidate && safeEqual(candidate, serviceToken)) {
      req.auth = { sub: 'service', claims: { svc: true } };
      return next();
    }
  }
  if (!jwksUrl) return next(); // unconfigured → open (dev only; prod blocked at boot)
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ')
    ? header.slice(7)
    : (typeof req.query.token === 'string' ? req.query.token : null);
  if (!token) { res.status(401).json({ error: 'Missing session token' }); return; }
  try {
    const { payload } = await jwtVerify(token, getJwks()!);
    // Bind to this app: if an azp allowlist is configured, the token must match it.
    if (allowedAzp.length) {
      const azp = typeof payload.azp === 'string' ? payload.azp : '';
      const ok = allowedAzp.some((a) => azp === a || azp.startsWith(a));
      if (!ok) { res.status(401).json({ error: 'Token not authorized for this app' }); return; }
    }
    req.auth = { sub: String(payload.sub), claims: payload as Record<string, unknown> };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
  }
}
