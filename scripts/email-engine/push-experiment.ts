/**
 * Allocate a workspace's sendable segment across an experiment's arms (deterministic, weighted) and
 * push each arm's contacts into its Bison campaign — THROTTLED (~1 write/sec) and FAIL-FAST.
 *
 *   npm run ee:push -- --workspace eso            # plan only (allocate + print, write nothing)
 *   npm run ee:push -- --workspace eso --commit    # record assignments + create+attach leads
 *
 * Reads scripts/email-engine/configs/<slug>.json for personaFilter / requireCompany / dedupe flags.
 * Re-runnable: only unassigned contacts get assigned, only un-pushed assignments get pushed.
 */
import { and, eq, isNull, inArray, like } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { experiments, experimentArms, experimentAssignments, bisonCampaigns,
         contacts, contactCompany, companies } from '../../src/db/schema.js';
import { allocate } from '../../src/engine/experiments/allocate.js';
import { loadConfig } from './config.js';
import { ctxFor, client } from './bison.js';

/** Email statuses safe to cold-email (mirrors activate.ts SENDABLE). */
const SENDABLE = ['deliverable', 'risky_catchall'];
interface SegmentRow {
  contactId: number; email: string | null; firstName: string | null; lastName: string | null;
  jobTitle: string | null; persona: string | null; companyName: string | null; subType: string | null;
}

/**
 * Build the campaign-ready segment with a DIRECT query — deliberately decoupled from
 * src/engine/stages/activate.ts, which is being actively changed in another session (schema drift:
 * e.g. a new persona_match column may not yet be migrated into the live DB). personaFilter is an
 * exact match; personaLike is a SQL LIKE pattern (e.g. 'ESO %'). De-dupes by email.
 */
async function buildSegment(opts: { personaExact?: string | null; personaLike?: string | null }): Promise<SegmentRow[]> {
  const conds = [inArray(contacts.emailStatus, SENDABLE)];
  if (opts.personaExact) conds.push(eq(contacts.persona, opts.personaExact));
  if (opts.personaLike) conds.push(like(contacts.persona, opts.personaLike));
  const rows = await db
    .select({
      contactId: contacts.id, email: contacts.email, firstName: contacts.firstName, lastName: contacts.lastName,
      jobTitle: contacts.jobTitle, persona: contacts.persona, companyName: companies.name, subType: companies.subType,
    })
    .from(contacts)
    .leftJoin(contactCompany, eq(contactCompany.contactId, contacts.id))
    .leftJoin(companies, eq(companies.id, contactCompany.companyId))
    .where(and(...conds))
    .orderBy(contacts.id);
  const seen = new Set<string>();
  return rows.filter((r) => r.email && !seen.has(r.email) && seen.add(r.email)) as SegmentRow[];
}

const arg = (f: string) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const COMMIT = process.argv.includes('--commit');

function toLead(r: SegmentRow) {
  return {
    email: r.email!, first_name: r.firstName ?? undefined, last_name: r.lastName ?? undefined,
    title: r.jobTitle ?? undefined, company: r.companyName ?? undefined,
    custom_variables: [
      ...(r.persona ? [{ name: 'persona', value: r.persona }] : []),
      ...(r.subType ? [{ name: 'sub_type', value: r.subType }] : []),
    ],
  };
}

async function main() {
  const slug = arg('--workspace');
  if (!slug) throw new Error('--workspace <slug> required');
  const cfg = loadConfig(slug);

  const [exp] = (await db.select().from(experiments)).filter((e) => e.name === cfg.experimentName);
  if (!exp) throw new Error(`experiment "${cfg.experimentName}" not found — run ee:build first`);
  const arms = await db.select().from(experimentArms).where(eq(experimentArms.experimentId, exp.id));
  const camps = await db.select().from(bisonCampaigns).where(inArray(bisonCampaigns.id, arms.map((a) => a.campaignId)));
  const campById = new Map(camps.map((c) => [c.id, c]));

  const bison = client(await ctxFor(slug));

  // Suppression: everyone already a lead in ANOTHER campaign in this workspace's Bison.
  const suppress = new Set<string>();
  if (cfg.dedupeAcrossCampaigns) {
    const ourBisonIds = new Set(camps.map((c) => c.bisonCampaignId));
    const all = await bison.listCampaigns();
    const others = all.filter((c: { id: number }) => !ourBisonIds.has(c.id));
    for (const c of others) for (const e of await bison.listCampaignLeadEmails(c.id)) suppress.add(e);
    console.log(`Suppression: ${suppress.size} emails already in other campaigns (${others.map((c: { id: number }) => '#' + c.id).join(', ') || 'none'})`);
  }

  // Segment + filters. Exclude contacts missing a first name — the instance requires first_name on
  // lead create, AND a blank renders "Hi ," in the copy. (Same rationale as requireCompany.)
  const segAll = await buildSegment({ personaExact: cfg.personaFilter, personaLike: cfg.personaLike });
  const named = segAll.filter((r) => r.firstName && r.firstName.trim());
  const withCompany = cfg.requireCompany ? named.filter((r) => r.companyName) : named;
  const seg = withCompany.filter((r) => !suppress.has((r.email || '').toLowerCase().trim()));
  const exclNoName = segAll.length - named.length;
  const rowById = new Map(seg.map((r) => [r.contactId, r]));

  const existing = await db.select({ contactId: experimentAssignments.contactId })
    .from(experimentAssignments).where(eq(experimentAssignments.experimentId, exp.id));
  const assignedIds = new Set(existing.map((a) => a.contactId));
  const unassigned = seg.map((r) => r.contactId).filter((id) => !assignedIds.has(id));
  const weights = arms.map((a) => ({ armId: a.id, weight: a.weight }));
  const fresh = allocate(unassigned, weights);
  const byArm = new Map<number, number>();
  for (const f of fresh) byArm.set(f.armId, (byArm.get(f.armId) ?? 0) + 1);

  console.log(`\nExperiment "${exp.name}"  (workspace ${slug})`);
  console.log(`Segment: ${segAll.length} sendable − ${exclNoName} no-name − ${named.length - withCompany.length} no-company − ${withCompany.length - seg.length} suppressed = ${seg.length} eligible`);
  console.log(`Already assigned: ${assignedIds.size}; new to assign: ${fresh.length}`);
  for (const a of arms) console.log(`  ${a.label}  (bison #${campById.get(a.campaignId)?.bisonCampaignId})  +${byArm.get(a.id) ?? 0}`);

  if (!COMMIT) { console.log('\n[plan only] pass --commit to assign + push.'); return; }

  if (fresh.length) {
    await db.insert(experimentAssignments)
      .values(fresh.map((f) => ({ experimentId: exp.id, contactId: f.contactId, armId: f.armId })))
      .onConflictDoNothing();
    console.log(`\nRecorded ${fresh.length} assignments.`);
  }

  let totalCreated = 0;
  for (const arm of arms) {
    const camp = campById.get(arm.campaignId);
    if (!camp?.bisonCampaignId) { console.log(`  ${arm.label}: no bison id, skip`); continue; }
    const unsent = await db.select({ contactId: experimentAssignments.contactId })
      .from(experimentAssignments)
      .where(and(eq(experimentAssignments.experimentId, exp.id), eq(experimentAssignments.armId, arm.id), isNull(experimentAssignments.pushedAt)));
    // map each unsent assignment back to its contactId so we can mark pushedAt per contact
    const unsentRows = unsent.map((u) => ({ contactId: u.contactId, row: rowById.get(u.contactId) }))
      .filter((x) => x.row) as { contactId: number; row: SegmentRow }[];
    if (!unsentRows.length) { console.log(`  ${arm.label}: nothing unsent`); continue; }

    console.log(`\n  ${arm.label} → bison #${camp.bisonCampaignId}: ensuring ${unsentRows.length} leads (throttled, idempotent)…`);
    // Process in batches: ensure (search-or-create) each lead, attach the batch, mark pushedAt.
    // Per-batch durability means an abort never loses or double-counts more than one batch.
    const BATCH = 50;
    for (let i = 0; i < unsentRows.length; i += BATCH) {
      const slice = unsentRows.slice(i, i + BATCH);
      const ids: number[] = [];
      for (const { row } of slice) ids.push(await bison.ensureLeadThrottled(toLead(row))); // throws → abort
      await bison.attachLeads(camp.bisonCampaignId, ids);
      await db.update(experimentAssignments).set({ pushedAt: new Date() })
        .where(and(eq(experimentAssignments.experimentId, exp.id), inArray(experimentAssignments.contactId, slice.map((s) => s.contactId)), eq(experimentAssignments.armId, arm.id)));
      totalCreated += ids.length;
      console.log(`    ${Math.min(i + BATCH, unsentRows.length)}/${unsentRows.length}…`);
    }
    console.log(`    done: ${unsentRows.length} ensured + attached`);
  }
  console.log(`\nTotal created + attached: ${totalCreated}.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', (e as Error).message); process.exit(1); });
