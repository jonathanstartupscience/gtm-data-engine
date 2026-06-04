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

export interface CompanySelector {
  type?: string;        // internal type value (e.g. CUSTOMER)
  subType?: string;
  country?: string;
  persona?: string;     // when onlyMissingPersona, exclude companies that already have this persona
  onlyMissingPersona?: boolean;
}

/**
 * Company-FIRST selection for contact sourcing: filter the account set by Type / Sub-type /
 * country (all optional), require a domain, and optionally keep only companies that don't yet
 * have a contact in the target persona. This is the "which companies are we finding people at?"
 * step the team asked for.
 */
export async function selectCompaniesForContactSearch(sel: CompanySelector, limit = 5000) {
  const rows = await db
    .select({ id: companies.id, domain: companies.domain, name: companies.name, subType: companies.subType })
    .from(companies)
    .where(and(
      isNotNull(companies.domain), ne(companies.domain, ''),
      sel.type ? eq(companies.type, sel.type) : undefined,
      sel.subType ? eq(companies.subType, sel.subType) : undefined,
      sel.country ? eq(companies.country, sel.country) : undefined,
    ))
    .limit(limit);
  if (!sel.onlyMissingPersona || !sel.persona) {
    return rows.map((c) => ({ id: c.id, domain: c.domain!, name: c.name }));
  }
  // Keep only companies lacking a contact in this persona.
  const out: { id: number; domain: string; name: string | null }[] = [];
  for (const c of rows) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` })
      .from(contacts).innerJoin(contactCompany, eq(contactCompany.contactId, contacts.id))
      .where(and(eq(contactCompany.companyId, c.id), eq(contacts.persona, sel.persona)));
    if (n === 0) out.push({ id: c.id, domain: c.domain!, name: c.name });
  }
  return out;
}

/** Back-compat shim. */
export async function companiesMissingPersona(persona: string, subType?: string, limit = 5000) {
  return selectCompaniesForContactSearch({ persona, subType, onlyMissingPersona: true }, limit);
}

export interface FindContactsResult { companies: number; found: number; added: number; errors: number }

/** Discover people for the target roles at a filtered company set; resolve into the store. */
export async function findContacts(
  opts: {
    persona: string; type?: string; subType?: string; country?: string;
    onlyMissingPersona?: boolean; titles?: string[]; perCompany?: number; limitCompanies?: number;
  },
  log: (m: string) => void = console.log,
): Promise<FindContactsResult> {
  const titles = opts.titles?.length ? opts.titles : (PERSONA_TITLES[opts.persona] ?? [opts.persona]);
  const perCompany = opts.perCompany ?? 2;
  const targets = await selectCompaniesForContactSearch(
    { type: opts.type, subType: opts.subType, country: opts.country, persona: opts.persona, onlyMissingPersona: opts.onlyMissingPersona },
    opts.limitCompanies ?? 1000,
  );
  log(`${targets.length} companies match — sourcing ${titles.join(', ')}`);
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
