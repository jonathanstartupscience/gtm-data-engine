/**
 * Find Contacts stage — discover NEW people at companies that are missing a target persona,
 * via Airscale findPeople. Mirrors "Find Companies": Find Companies grows the account list;
 * Find Contacts fills in the right people at those accounts. Discovered people are resolved
 * into the store, associated to their company, tagged with the persona.
 */
import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies, contacts, contactCompany } from '../../db/schema.js';
import { findPeople } from '../adapters/airscale.js';
import { resolveContact } from '../resolve.js';
import { classifyPersona } from '../persona.js';

/** Title sets per persona, passed to Airscale to source the right people. */
const PERSONA_TITLES: Record<string, string[]> = {
  'ESO Leadership': ['Executive Director', 'CEO', 'President', 'Managing Director'],
  'ESO Program': ['Program Director', 'Program Manager', 'Accelerator Director', 'Incubator Director'],
  'ESO Partnerships': ['Partnerships', 'Business Development', 'Community Director', 'Ecosystem'],
  'ESO Founder/GP': ['Founder', 'Co-Founder', 'Managing Partner', 'General Partner'],
};

/** Companies (domain present) that have NO contact for the given persona yet. */
export async function companiesMissingPersona(persona: string, subType?: string, limit = 5000) {
  const rows = await db
    .select({ id: companies.id, domain: companies.domain, name: companies.name, subType: companies.subType })
    .from(companies)
    .where(and(isNotNull(companies.domain), ne(companies.domain, ''),
      subType ? eq(companies.subType, subType) : undefined))
    .limit(limit);
  // filter to those lacking a contact in this persona
  const out: { id: number; domain: string; name: string | null }[] = [];
  for (const c of rows) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
      .from(contacts).innerJoin(contactCompany, eq(contactCompany.contactId, contacts.id))
      .where(and(eq(contactCompany.companyId, c.id), eq(contacts.persona, persona)));
    if (n === 0) out.push({ id: c.id, domain: c.domain!, name: c.name });
  }
  return out;
}

export interface FindContactsResult { companies: number; found: number; added: number; errors: number }

/** Discover people for the target persona at companies missing it; resolve into the store. */
export async function findContacts(
  opts: { persona: string; subType?: string; perCompany?: number; limitCompanies?: number },
  log: (m: string) => void = console.log,
): Promise<FindContactsResult> {
  const titles = PERSONA_TITLES[opts.persona] ?? [opts.persona];
  const perCompany = opts.perCompany ?? 2;
  const targets = await companiesMissingPersona(opts.persona, opts.subType, opts.limitCompanies ?? 1000);
  log(`${targets.length} companies missing "${opts.persona}"`);
  let found = 0, added = 0, errors = 0;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    try {
      const leads = await findPeople(t.domain, titles, perCompany);
      for (const ld of leads.slice(0, perCompany)) {
        const first = (ld.firstname ?? '').trim();
        const last = (ld.lastname ?? '').trim();
        if (!first && !last) continue;
        found++;
        const title = (ld.jobTitle ?? ld.headline ?? '').trim();
        await resolveContact({
          firstName: first, lastName: last, jobTitle: title,
          persona: classifyPersona(title) || opts.persona,
          linkedinUrl: ld.profileUrl, companyDomain: t.domain,
        }, 'airscale_findpeople');
        added++;
      }
    } catch (e) {
      errors++;
      if (errors <= 5) log(`  find error for ${t.domain}: ${(e as Error).message.slice(0, 80)}`);
    }
    if ((i + 1) % 25 === 0) log(`  processed ${i + 1}/${targets.length} companies (${added} people added)…`);
  }
  return { companies: targets.length, found, added, errors };
}
