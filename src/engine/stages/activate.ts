/**
 * Activate stage — push a filtered, campaign-ready contact segment from the store into an
 * Email Bison campaign. Enforces the cold-email safety rules (only deliverable / risky-catchall;
 * never role-based, undeliverable, unknown, or no-email).
 */
import { and, eq, like, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { contacts, contactCompany, companies, bisonCampaigns } from '../../db/schema.js';
import { bisonClientFor, type BisonClient, type BisonLead } from '../adapters/emailbison.js';

/** Email statuses that are safe to cold-email. */
const SENDABLE = ['deliverable', 'risky_catchall'];

/**
 * Segment scoping. `persona` is an exact match; `personaMatch` is a SQL LIKE pattern that maps to a
 * SET of personas (e.g. 'ESO %') and, when present, OVERRIDES `persona`. With neither set, the
 * segment spans every sendable persona in the store.
 */
export interface SegmentFilter { persona?: string; personaMatch?: string; subType?: string }

/** Build the persona predicate: LIKE pattern wins over exact match; neither → no persona filter. */
function personaCond(filter: SegmentFilter) {
  if (filter.personaMatch) return like(contacts.persona, filter.personaMatch);
  if (filter.persona) return eq(contacts.persona, filter.persona);
  return undefined;
}

/** Resolve a campaign-ready contact segment (with company context) from the store. */
export async function segment(filter: SegmentFilter, limit = 100000) {
  const conds = [
    inArray(contacts.emailStatus, SENDABLE),
    personaCond(filter),
  ].filter(Boolean);
  let rows = await db
    .select({
      email: contacts.email, firstName: contacts.firstName, lastName: contacts.lastName,
      jobTitle: contacts.jobTitle, persona: contacts.persona,
      companyName: companies.name, subType: companies.subType,
    })
    .from(contacts)
    .leftJoin(contactCompany, eq(contactCompany.contactId, contacts.id))
    .leftJoin(companies, eq(companies.id, contactCompany.companyId))
    .where(and(...conds))
    .limit(limit);
  if (filter.subType) rows = rows.filter((r) => r.subType === filter.subType);
  // de-dupe by email + require an email
  const seen = new Set<string>();
  return rows.filter((r) => r.email && !seen.has(r.email) && seen.add(r.email));
}

/** Count the segment (for a pre-send preview — no send). */
export async function segmentCount(filter: SegmentFilter): Promise<number> {
  return (await segment(filter)).length;
}

/**
 * Same campaign-ready segment, but carrying the stable contact id — used by the experiment
 * layer to pin contacts to arms. De-dupes by email (first id wins) so a person is one unit.
 */
export async function segmentWithIds(filter: SegmentFilter, limit = 100000) {
  const conds = [
    inArray(contacts.emailStatus, SENDABLE),
    personaCond(filter),
  ].filter(Boolean);
  let rows = await db
    .select({
      contactId: contacts.id,
      email: contacts.email, firstName: contacts.firstName, lastName: contacts.lastName,
      jobTitle: contacts.jobTitle, persona: contacts.persona,
      companyName: companies.name, subType: companies.subType,
    })
    .from(contacts)
    .leftJoin(contactCompany, eq(contactCompany.contactId, contacts.id))
    .leftJoin(companies, eq(companies.id, contactCompany.companyId))
    .where(and(...conds))
    .orderBy(contacts.id)
    .limit(limit);
  if (filter.subType) rows = rows.filter((r) => r.subType === filter.subType);
  const seen = new Set<string>();
  return rows.filter((r) => r.email && !seen.has(r.email) && seen.add(r.email));
}

export type SegmentRow = Awaited<ReturnType<typeof segmentWithIds>>[number];

/**
 * Build a cross-campaign suppression set: every email already enrolled as a lead in the workspace's
 * OTHER campaigns (so a push never double-emails someone already in flight, or re-cold-emails a
 * lead who already replied/bounced). `exceptCampaignIds` are the local campaign ids we're pushing
 * INTO — their own leads aren't suppressed (re-running a push to the same campaign is idempotent via
 * the assignment's pushedAt). Best-effort: a campaign whose lead list can't be read is skipped with
 * a log line rather than blocking the push.
 */
export async function buildSuppressionSet(
  workspaceId: number | null | undefined,
  exceptCampaignIds: number[] = [],
  log: (m: string) => void = console.log,
): Promise<Set<string>> {
  const suppressed = new Set<string>();
  if (!workspaceId) return suppressed;
  const except = new Set(exceptCampaignIds);
  const others = (await db.select({ id: bisonCampaigns.id, bisonCampaignId: bisonCampaigns.bisonCampaignId, name: bisonCampaigns.name })
    .from(bisonCampaigns).where(eq(bisonCampaigns.workspaceId, workspaceId)))
    .filter((c) => c.bisonCampaignId != null && !except.has(c.id));
  if (!others.length) return suppressed;
  const bison = await bisonClientFor(workspaceId);
  for (const c of others) {
    try {
      const leads = await bison.listCampaignLeads(c.bisonCampaignId!);
      for (const l of leads) if (l.email) suppressed.add(l.email);
    } catch (e) {
      log(`  (could not read leads for "${c.name}" — not suppressing it: ${e instanceof Error ? e.message : String(e)})`);
    }
  }
  return suppressed;
}

/** Fields toBisonLeads reads — both segment() and segmentWithIds() rows satisfy this. */
type LeadFields = Omit<SegmentRow, 'contactId'>;

/** Map resolved segment rows to Bison lead payloads (with persona/sub_type custom vars). */
function toBisonLeads(rows: LeadFields[]): BisonLead[] {
  return rows.map((r) => ({
    email: r.email!, first_name: r.firstName ?? undefined, last_name: r.lastName ?? undefined,
    title: r.jobTitle ?? undefined, company: r.companyName ?? undefined,
    // Custom-var names match the instance's UPPERCASE merge-tag dialect ({PERSONA}, {SUB_TYPE}).
    custom_variables: [
      ...(r.persona ? [{ name: 'PERSONA', value: r.persona }] : []),
      ...(r.subType ? [{ name: 'SUB_TYPE', value: r.subType }] : []),
    ],
  }));
}

/**
 * Push a specific set of pre-resolved segment rows to a campaign in a given workspace's Bison.
 * Pass the workspace's `BisonClient` (the experiment loop resolves one and reuses it per arm).
 */
export async function pushRowsToBison(
  bison: BisonClient,
  bisonCampaignId: number,
  rows: LeadFields[],
  log: (m: string) => void = console.log,
  suppress?: Set<string>,
): Promise<{ segment: number; created: number; attached: number; failed: number; suppressed: number }> {
  const before = rows.length;
  const kept = suppress?.size ? rows.filter((r) => !suppress.has(r.email!.toLowerCase())) : rows;
  const suppressed = before - kept.length;
  if (suppressed) log(`Excluded ${suppressed} contact(s) already in another campaign in this workspace.`);
  const leads = toBisonLeads(kept);
  log(`Pushing ${leads.length} campaign-ready contacts to Email Bison…`);
  const r = await bison.pushLeadsToCampaign(bisonCampaignId, leads, log);
  return { segment: leads.length, suppressed, ...r };
}

/**
 * Push the segment into a Bison campaign in the given workspace. Subtracts any email already
 * enrolled in another of the workspace's campaigns (cross-campaign dedup) so nobody is double-
 * emailed. `localCampaignId` is the app's campaign row id for the target (excluded from suppression).
 */
export async function pushToBison(
  workspaceId: number | null | undefined,
  bisonCampaignId: number,
  filter: SegmentFilter,
  log: (m: string) => void = console.log,
  localCampaignId?: number,
): Promise<{ segment: number; created: number; attached: number; failed: number; suppressed: number }> {
  const rows = await segment(filter);
  const suppress = await buildSuppressionSet(workspaceId, localCampaignId ? [localCampaignId] : [], log);
  const bison = await bisonClientFor(workspaceId);
  return pushRowsToBison(bison, bisonCampaignId, rows, log, suppress);
}
