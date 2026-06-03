/** Run tracking — every recipe execution gets a row in `runs` with live stats. */
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { runs } from '../db/schema.js';

export async function startRun(kind: string): Promise<number> {
  const [r] = await db.insert(runs).values({ kind, status: 'running', stats: {} }).returning({ id: runs.id });
  return r.id;
}

export async function finishRun(id: number, status: 'done' | 'error', stats: unknown): Promise<void> {
  await db.update(runs).set({ status, stats: stats as object, finishedAt: new Date() }).where(eq(runs.id, id));
}
