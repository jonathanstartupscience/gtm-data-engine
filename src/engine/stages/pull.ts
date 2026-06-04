/**
 * Pull stage — import companies (and later contacts) FROM HubSpot into the canonical
 * store. This is what makes the engine CRM-wide: it brings in EVERY Type/Sub-type, which
 * auto-populates the taxonomy (no longer ESO-only). Reconciles/dedupes via resolveCompany.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies } from '../../db/schema.js';
import { listObjectsAll, listAllProperties } from '../adapters/hubspot.js';
import { resolveCompany, resolveContact, type CompanyInput, type ContactInput } from '../resolve.js';
import { classifyPersona } from '../persona.js';

const COMPANY_PROPS = [
  'name', 'domain', 'website', 'type', 'sub_type', 'audience_type', 'country',
  'state', 'city', 'zip', 'linkedin_company_page', 'founded_year', 'numberofemployees', 'industry',
  'lifecyclestage', 'hs_lead_status', 'hubspot_owner_id', 'annualrevenue', 'phone',
  'createdate', 'hs_lastmodifieddate', 'notes_last_updated',
];

// Known props we promote to columns; everything else goes to propertiesJson.
const COMPANY_MAPPED = new Set([...COMPANY_PROPS]);

function toInt(v?: string): number | undefined {
  const n = Number(String(v ?? '').replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** HubSpot returns ISO strings or epoch-ms; parse to a Date, or undefined if unusable. */
function toDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = /^\d+$/.test(v) ? new Date(Number(v)) : new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Map a HubSpot company's properties → CompanyInput (known→columns, rest→propertiesJson). */
function mapCompany(id: string, p: Record<string, string>): CompanyInput {
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) if (!COMPANY_MAPPED.has(k) && v) extra[k] = v;
  return {
    name: p.name, domain: p.domain, website: p.website,
    type: p.type, subType: p.sub_type, audienceType: p.audience_type,
    country: p.country, state: p.state, city: p.city, zip: p.zip,
    linkedinUrl: p.linkedin_company_page, foundedYear: p.founded_year,
    sizeEmployees: p.numberofemployees, sector: p.industry, hubspotId: id,
    lifecycleStage: p.lifecyclestage, leadStatus: p.hs_lead_status, ownerId: p.hubspot_owner_id,
    industry: p.industry, revenue: p.annualrevenue, employeeCount: toInt(p.numberofemployees),
    phone: p.phone,
    hsCreatedAt: toDate(p.createdate),
    hsLastActivityAt: toDate(p.notes_last_updated || p.hs_lastmodifieddate),
    propertiesJson: extra,
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
  // Request EVERY property so propertiesJson is a complete mirror — no future re-pull to get a field.
  const allProps = await listAllProperties('companies');
  log(`  requesting all ${allProps.length} company properties`);
  let cursor: string | undefined;
  let pulled = 0, resolved = 0, pages = 0, errors = 0;

  do {
    const page = await listObjectsAll('companies', allProps, cursor, 100);
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
    const next = page.cursorId ?? undefined;
    if (next && next === cursor) { log('  cursor stalled — stopping to avoid a loop'); break; }
    cursor = next;
    if (pages % 5 === 0) log(`  pulled ${pulled} companies (${resolved} resolved)…`);
  } while (cursor && pulled < cap);

  return { pulled, resolved, pages, errors, capped: pulled >= cap && !!cursor };
}

// ---------------------------------------------------------------- contacts
const CONTACT_PROPS = [
  'firstname', 'lastname', 'email', 'jobtitle', 'hs_persona',
  'hs_linkedin_url', 'linkedin', 'associatedcompanyid',
  'lifecyclestage', 'hs_lead_status', 'hubspot_owner_id', 'seniority', 'phone',
  'city', 'state', 'country', 'hs_analytics_source', 'createdate', 'lastmodifieddate',
];
const CONTACT_MAPPED = new Set([...CONTACT_PROPS]);

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
  const allProps = await listAllProperties('contacts');
  log(`  requesting all ${allProps.length} contact properties`);
  let cursor: string | undefined;
  let pulled = 0, resolved = 0, pages = 0, errors = 0;

  do {
    const page = await listObjectsAll('contacts', allProps, cursor, 100);
    pages++;
    for (const obj of page.results) {
      if (pulled >= cap) break;
      pulled++;
      const p = obj.properties;
      if (!p.email && !p.firstname && !p.lastname) continue;
      const companyDomain = p.associatedcompanyid ? hsIdToDomain.get(p.associatedcompanyid) : undefined;
      const extra: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(p)) if (!CONTACT_MAPPED.has(k) && v) extra[k] = v;
      const input: ContactInput = {
        firstName: p.firstname, lastName: p.lastname, email: p.email, jobTitle: p.jobtitle,
        persona: p.hs_persona || classifyPersona(p.jobtitle) || '',
        linkedinUrl: p.hs_linkedin_url || p.linkedin,
        companyDomain, hubspotId: obj.id,
        lifecycleStage: p.lifecyclestage, leadStatus: p.hs_lead_status, ownerId: p.hubspot_owner_id,
        seniority: p.seniority, phone: p.phone, city: p.city, state: p.state, country: p.country,
        source: p.hs_analytics_source,
        hsCreatedAt: toDate(p.createdate),
        hsLastActivityAt: toDate(p.lastmodifieddate),
        propertiesJson: extra,
      };
      try {
        await resolveContact(input, 'hubspot_pull');
        resolved++;
      } catch (e) {
        errors++;
        if (errors <= 5) log(`  resolve error (hs contact ${obj.id}): ${(e as Error).message.slice(0, 80)}`);
      }
    }
    const next = page.cursorId ?? undefined;
    if (next && next === cursor) { log('  cursor stalled — stopping to avoid a loop'); break; }
    cursor = next;
    if (pages % 5 === 0) log(`  pulled ${pulled} contacts (${resolved} resolved)…`);
  } while (cursor && pulled < cap);

  return { pulled, resolved, pages, errors, capped: pulled >= cap && !!cursor };
}

void eq; // (reserved for future per-contact company lookups)
