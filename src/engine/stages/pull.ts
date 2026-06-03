/**
 * Pull stage — import companies (and later contacts) FROM HubSpot into the canonical
 * store. This is what makes the engine CRM-wide: it brings in EVERY Type/Sub-type, which
 * auto-populates the taxonomy (no longer ESO-only). Reconciles/dedupes via resolveCompany.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies } from '../../db/schema.js';
import { listObjects } from '../adapters/hubspot.js';
import { resolveCompany, resolveContact, type CompanyInput, type ContactInput } from '../resolve.js';
import { classifyPersona } from '../persona.js';

const COMPANY_PROPS = [
  'name', 'domain', 'website', 'type', 'sub_type', 'audience_type', 'country',
  'state', 'city', 'linkedin_company_page', 'founded_year', 'numberofemployees', 'industry',
];

/** Map a HubSpot company's properties → our CompanyInput. */
function mapCompany(id: string, p: Record<string, string>): CompanyInput {
  return {
    name: p.name, domain: p.domain, website: p.website,
    type: p.type, subType: p.sub_type, audienceType: p.audience_type,
    country: p.country, state: p.state, city: p.city,
    linkedinUrl: p.linkedin_company_page, foundedYear: p.founded_year,
    sizeEmployees: p.numberofemployees, sector: p.industry, hubspotId: id,
  };
}

export interface PullResult {
  pulled: number; resolved: number; pages: number; errors: number; capped: boolean;
}

/**
 * Pull companies from HubSpot into the store. `limit` caps total records (for a safe test
 * run); omit for the full pull. Resolves each into a golden record (dedupe by domain/etc.).
 */
export async function pullCompanies(
  opts: { limit?: number } = {},
  log: (m: string) => void = console.log,
): Promise<PullResult> {
  const cap = opts.limit ?? Infinity;
  let after: string | undefined;
  let pulled = 0, resolved = 0, pages = 0, errors = 0;

  do {
    const page = await listObjects('companies', COMPANY_PROPS, after, 100);
    pages++;
    for (const obj of page.results) {
      if (pulled >= cap) break;
      pulled++;
      try {
        // Skip empty shells (no name and no domain) — nothing to resolve on.
        if (!obj.properties.name && !obj.properties.domain) continue;
        await resolveCompany(mapCompany(obj.id, obj.properties), 'hubspot_pull');
        resolved++;
      } catch (e) {
        errors++;
        if (errors <= 5) log(`  resolve error (hs ${obj.id}): ${(e as Error).message.slice(0, 80)}`);
      }
    }
    after = page.after;
    if (pages % 5 === 0) log(`  pulled ${pulled} companies (${resolved} resolved)…`);
  } while (after && pulled < cap);

  return { pulled, resolved, pages, errors, capped: pulled >= cap && !!after };
}

// ---------------------------------------------------------------- contacts
const CONTACT_PROPS = [
  'firstname', 'lastname', 'email', 'jobtitle', 'hs_persona',
  'hs_linkedin_url', 'linkedin', 'associatedcompanyid',
];

/** Cache HubSpot company-id → domain so we can associate pulled contacts to companies. */
async function companyDomainByHsId(): Promise<Map<string, string>> {
  const rows = await db.select({ hs: companies.hubspotId, dom: companies.domain }).from(companies);
  const m = new Map<string, string>();
  for (const r of rows) if (r.hs && r.dom) m.set(r.hs, r.dom);
  return m;
}

/** Pull contacts from HubSpot → store, associating to companies by associatedcompanyid. */
export async function pullContacts(
  opts: { limit?: number } = {},
  log: (m: string) => void = console.log,
): Promise<PullResult> {
  const cap = opts.limit ?? Infinity;
  const hsIdToDomain = await companyDomainByHsId();
  let after: string | undefined;
  let pulled = 0, resolved = 0, pages = 0, errors = 0;

  do {
    const page = await listObjects('contacts', CONTACT_PROPS, after, 100);
    pages++;
    for (const obj of page.results) {
      if (pulled >= cap) break;
      pulled++;
      const p = obj.properties;
      if (!p.email && !p.firstname && !p.lastname) continue;
      const companyDomain = p.associatedcompanyid ? hsIdToDomain.get(p.associatedcompanyid) : undefined;
      const input: ContactInput = {
        firstName: p.firstname, lastName: p.lastname, email: p.email, jobTitle: p.jobtitle,
        persona: p.hs_persona || classifyPersona(p.jobtitle) || '',
        linkedinUrl: p.hs_linkedin_url || p.linkedin,
        companyDomain, hubspotId: obj.id,
      };
      try {
        await resolveContact(input, 'hubspot_pull');
        resolved++;
      } catch (e) {
        errors++;
        if (errors <= 5) log(`  resolve error (hs contact ${obj.id}): ${(e as Error).message.slice(0, 80)}`);
      }
    }
    after = page.after;
    if (pages % 5 === 0) log(`  pulled ${pulled} contacts (${resolved} resolved)…`);
  } while (after && pulled < cap);

  return { pulled, resolved, pages, errors, capped: pulled >= cap && !!after };
}

void eq; // (reserved for future per-contact company lookups)
