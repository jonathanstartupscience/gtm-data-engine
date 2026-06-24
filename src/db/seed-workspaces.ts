/**
 * Idempotent seed for Email-Engine workspaces. Mirrors Email Bison's account → workspaces model:
 * one Bison account, one workspace per persona, each with its own API key (stored in the secret
 * layer as EMAILBISON_API_KEY__<slug>, NOT here). Safe to run on every deploy.
 *
 * Also performs a ONE-TIME backfill: any pre-existing Email-Engine record with a null workspaceId
 * is homed to the ESO workspace (the seeded library is ESO-led). Runs only while rows are null, so
 * re-running after you re-home records by hand won't clobber them.
 */
import { eq, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  workspaces, bisonCampaigns, sequenceTemplates, experiments, bisonReplies, bisonPushLog,
} from './schema.js';

/** The fixed set of workspaces. ESO first (default/backfill target); Community Funding inactive. */
export const WORKSPACE_SEED = [
  { slug: 'eso',               name: 'ESOs',              persona: 'eso',       sortOrder: 1, active: true },
  { slug: 'founder',           name: 'Founders',          persona: 'founder',   sortOrder: 2, active: true },
  { slug: 'investor',          name: 'Investors',         persona: 'investor',  sortOrder: 3, active: true },
  { slug: 'provider',          name: 'Providers',         persona: 'provider',  sortOrder: 4, active: true },
  { slug: 'advisor',           name: 'Advisors',          persona: 'advisor',   sortOrder: 5, active: true },
  { slug: 'community-funding', name: 'Community Funding', persona: null,        sortOrder: 6, active: false },
] as const;

export async function seedWorkspaces(db: PostgresJsDatabase<Record<string, never>>): Promise<void> {
  // 1) Upsert the workspace rows (name/persona/sort/active kept current; slug is the identity).
  for (const w of WORKSPACE_SEED) {
    await db.insert(workspaces).values(w)
      .onConflictDoUpdate({
        target: workspaces.slug,
        set: { name: w.name, persona: w.persona, sortOrder: w.sortOrder, active: w.active },
      });
  }

  // 2) One-time backfill of legacy records (workspaceId IS NULL) → ESO.
  const [eso] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, 'eso'));
  if (!eso) return;
  await db.update(bisonCampaigns).set({ workspaceId: eso.id }).where(isNull(bisonCampaigns.workspaceId));
  await db.update(sequenceTemplates).set({ workspaceId: eso.id }).where(isNull(sequenceTemplates.workspaceId));
  await db.update(experiments).set({ workspaceId: eso.id }).where(isNull(experiments.workspaceId));
  await db.update(bisonReplies).set({ workspaceId: eso.id }).where(isNull(bisonReplies.workspaceId));
  await db.update(bisonPushLog).set({ workspaceId: eso.id }).where(isNull(bisonPushLog.workspaceId));
}
