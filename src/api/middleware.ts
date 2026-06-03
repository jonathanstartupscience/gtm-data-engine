/** Cross-cutting Express middleware: async wrapper, error handler, security headers. */
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/** Wrap an async handler so rejections flow to the error middleware (Express 4 needs this). */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { fn(req, res, next).catch(next); };
}

/** Terminal error handler — logs full detail server-side, returns a generic message + id. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const id = Math.random().toString(36).slice(2, 10);
  // Full detail to server logs only.
  console.error(`[error ${id}]`, err instanceof Error ? err.stack : err);
  if (res.headersSent) return; // (e.g. mid-SSE) — can't change the response
  res.status(500).json({ error: 'Internal error', id });
}

/** Minimal security headers (avoids a helmet dependency; covers the important ones). */
export function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}

/** Register process-level guards so one unhandled rejection can't silently kill the service. */
export function installProcessGuards(): void {
  process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason instanceof Error ? reason.stack : reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err.stack ?? err);
    // Stay alive — log and continue; Railway restart policy handles truly fatal states.
  });
}
