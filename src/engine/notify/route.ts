/**
 * Round-robin routing for reply notifications. A reply is assigned to the next rep in turn from
 * the most specific roster that matches it:
 *   1. campaign-scoped roster  (notify_routes.campaignId === reply.campaignId)
 *   2. workspace-scoped roster (notify_routes.workspaceId === reply.workspaceId)
 *   3. global default          (both null)
 * The matched roster's `rrCursor` is bumped atomically so concurrent webhooks don't hand the same
 * lead to two reps. The chosen Google Chat space is the roster's override URL, else the global secret.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { notifyRoutes } from '../../db/schema.js';
import { getSecret } from '../../lib/secrets.js';

export interface RoutePick {
  rep: string | null;        // round-robin display name, or null if no roster/reps configured
  webhookUrl: string | null; // Google Chat space URL to post into, or null if none resolvable
}

/** Resolve and advance the round-robin for a reply. Returns the rep + the space URL to post to. */
export async function pickRep(opts: { workspaceId?: number | null; campaignId?: number | null }): Promise<RoutePick> {
  const route = await matchRoute(opts);
  const fallbackUrl = (await getSecret('GOOGLE_CHAT_WEBHOOK_URL')) || null;

  if (!route) return { rep: null, webhookUrl: fallbackUrl };

  const reps = Array.isArray(route.reps) ? (route.reps as unknown[]).filter((r): r is string => typeof r === 'string' && !!r) : [];
  const webhookUrl = route.webhookUrlOverride || fallbackUrl;
  if (reps.length === 0) return { rep: null, webhookUrl };

  // Atomically bump the cursor and read back the value we just consumed (pre-increment).
  const [updated] = await db.update(notifyRoutes)
    .set({ rrCursor: sql`${notifyRoutes.rrCursor} + 1`, updatedAt: new Date() })
    .where(eq(notifyRoutes.id, route.id))
    .returning({ rrCursor: notifyRoutes.rrCursor });
  const idx = ((updated?.rrCursor ?? 1) - 1) % reps.length; // -1: use the pre-bump index
  return { rep: reps[idx], webhookUrl };
}

/** Find the most specific roster for a reply: campaign > workspace > global. */
async function matchRoute(opts: { workspaceId?: number | null; campaignId?: number | null }) {
  if (opts.campaignId) {
    const [c] = await db.select().from(notifyRoutes).where(eq(notifyRoutes.campaignId, opts.campaignId));
    if (c) return c;
  }
  if (opts.workspaceId) {
    const [w] = await db.select().from(notifyRoutes)
      .where(and(eq(notifyRoutes.workspaceId, opts.workspaceId), isNull(notifyRoutes.campaignId)));
    if (w) return w;
  }
  const [g] = await db.select().from(notifyRoutes)
    .where(and(isNull(notifyRoutes.workspaceId), isNull(notifyRoutes.campaignId)));
  return g ?? null;
}
