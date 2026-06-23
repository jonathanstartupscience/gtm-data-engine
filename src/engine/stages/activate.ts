/**
 * Activate stage — push a filtered, campaign-ready contact segment from the store into an
 * Email Bison campaign. Enforces the cold-email safety rules (only deliverable / risky-catchall;
 * never role-based, undeliverable, unknown, or no-email).
 */
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { contacts, contactCompany, companies } from '../../db/schema.js';
import { pushLeadsToCampaign, type BisonLead } from '../adapters/emailbison.js';

/** Email statuses that are safe to cold-email. */
const SENDABLE = ['deliverable', 'risky_catchall'];

export interface SegmentFilter { persona?: string; subType?: string }

/** Resolve a campaign-ready contact segment (with company context) from the store. */
export async function segment(filter: SegmentFilter, limit = 100000) {
  const conds = [
    inArray(contacts.emailStatus, SENDABLE),
    filter.persona ? eq(contacts.persona, filter.persona) : undefined,
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
    filter.persona ? eq(contacts.persona, filter.persona) : undefined,
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

/** Push a specific set of pre-resolved segment rows to a campaign (used by the experiment push). */
export async function pushRowsToBison(
  campaignId: number,
  rows: SegmentRow[],
  log: (m: string) => void = console.log,
): Promise<{ segment: number; created: number; attached: number; failed: number }> {
  const leads: BisonLead[] = rows.map((r) => ({
    email: r.email!, first_name: r.firstName ?? undefined, last_name: r.lastName ?? undefined,
    title: r.jobTitle ?? undefined, company: r.companyName ?? undefined,
    custom_variables: [
      ...(r.persona ? [{ name: 'persona', value: r.persona }] : []),
      ...(r.subType ? [{ name: 'sub_type', value: r.subType }] : []),
    ],
  }));
  log(`Pushing ${leads.length} campaign-ready contacts to Email Bison…`);
  const r = await pushLeadsToCampaign(campaignId, leads, log);
  return { segment: leads.length, ...r };
}

/** Push the segment into a Bison campaign. */
export async function pushToBison(
  campaignId: number,
  filter: SegmentFilter,
  log: (m: string) => void = console.log,
): Promise<{ segment: number; created: number; attached: number; failed: number }> {
  const rows = await segment(filter);
  const leads: BisonLead[] = rows.map((r) => ({
    email: r.email!, first_name: r.firstName ?? undefined, last_name: r.lastName ?? undefined,
    title: r.jobTitle ?? undefined, company: r.companyName ?? undefined,
    custom_variables: [
      ...(r.persona ? [{ name: 'persona', value: r.persona }] : []),
      ...(r.subType ? [{ name: 'sub_type', value: r.subType }] : []),
    ],
  }));
  log(`Pushing ${leads.length} campaign-ready contacts to Email Bison…`);
  const r = await pushLeadsToCampaign(campaignId, leads, log);
  return { segment: leads.length, ...r };
}
