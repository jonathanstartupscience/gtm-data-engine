/** Health + readiness: confirms the app is up and (optionally) the DB is reachable. */
import { Router } from 'express';
import { sql } from 'drizzle-orm';

export const health = Router();

health.get('/', async (_req, res) => {
  const out: Record<string, unknown> = { status: 'ok', ts: new Date().toISOString() };
  try {
    const { db } = await import('../../db/index.js');
    await db.execute(sql`select 1`);
    out.db = 'connected';
  } catch (err) {
    // Do NOT leak DB error detail to anonymous callers — log it, return generic status.
    console.error('[health] db check failed:', (err as Error).message);
    out.db = 'unavailable';
    out.status = 'degraded';
  }
  res.json(out);
});
