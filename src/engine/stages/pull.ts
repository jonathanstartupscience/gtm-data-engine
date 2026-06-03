/**
 * Pull stage — import companies (and later contacts) FROM HubSpot into the canonical
 * store. This is what makes the engine CRM-wide: it brings in EVERY Type/Sub-type, which
 * auto-populates the taxonomy (no longer ESO-only). Reconciles/dedupes via resolveCompany.
 */
import { listObjects } from '../adapters/hubspot.js';
import { resolveCompany, type CompanyInput } from '../resolve.js';

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
