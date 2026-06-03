/** Request validation (zod) + a tiny inbound rate limiter for expensive routes. */
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/** Validate req.body against a schema; 400 on failure. Returns parsed body via res.locals. */
export function validateBody<T extends z.ZodTypeAny>(schema: T) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      res.status(400).json({ error: 'Invalid request', details: r.error.issues.slice(0, 5) });
      return;
    }
    req.body = r.data;
    next();
  };
}

// ---- schemas ----
const MAX_CSV_BYTES = 25 * 1024 * 1024; // 25MB of CSV text
const csvField = z.string().min(1).max(MAX_CSV_BYTES);
const entityType = z.enum(['company', 'contact']);

export const importPreviewSchema = z.object({ csv: csvField, entityType });

export const importRunSchema = z.object({
  csv: csvField,
  entityType,
  mapping: z.record(z.string(), z.string()).default({}),
  sourceName: z.string().max(200).optional(),
});

// ---- inbound rate limiter (per-IP sliding window) ----
const buckets = new Map<string, number[]>();

/** Limit `max` requests per `windowMs` per client IP. For expensive/credit-spending routes. */
export function rateLimit(max: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      res.status(429).json({ error: 'Too many requests, slow down' });
      return;
    }
    hits.push(now);
    buckets.set(key, hits);
    next();
  };
}
