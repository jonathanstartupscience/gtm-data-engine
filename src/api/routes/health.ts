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
    out.db = 'unavailable';
    out.dbError = (err as Error).message.slice(0, 120);
  }
  res.json(out);
});
