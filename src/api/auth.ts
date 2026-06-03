/**
 * Clerk auth middleware — verifies the caller's Clerk session JWT against the
 * instance JWKS using `jose`. Matches the secret-less pattern used across our
 * internal apps. Env-driven:
 *   CLERK_JWKS_URL — https://<instance>.clerk.accounts.dev/.well-known/jwks.json
 *   CLERK_ALLOWED_ORIGINS — comma-separated allowed `azp` values (this app's origins)
 *
 * Fail-open ONLY in non-production. In production, a missing JWKS URL refuses to
 * start (see assertAuthSafe) so a typo can't silently expose PII.
 */
import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const jwksUrl = (process.env.CLERK_JWKS_URL ?? '').trim();
const allowedAzp = (process.env.CLERK_ALLOWED_ORIGINS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean);

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

/** Require a valid Clerk session. No-op (open) only when CLERK_JWKS_URL is unset (dev). */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
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
