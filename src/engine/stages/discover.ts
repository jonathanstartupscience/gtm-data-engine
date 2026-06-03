/**
 * Discover stage — find NEW target companies via Ocean.io lookalike search.
 * This is the growth engine: from ~700 ESOs toward the ~18k that exist.
 *
 * Given seed domains (companies we like), Ocean returns similar companies; we resolve
 * the new ones into the store tagged as discovered. Existing companies are skipped
 * (dedupe via resolution). Ocean lookalike search is plan-gated on some tiers — this
 * surfaces a clear, friendly error rather than failing opaquely.
 */
import { inArray, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies } from '../../db/schema.js';
import { searchCompanies, domainOf, type OceanCompany } from '../adapters/ocean.js';
import { resolveCompany } from '../resolve.js';
import { normDomain } from '../normalize.js';

/** Suggest seed domains from the store: a sample of existing companies, optionally by sub_type. */
export async function suggestSeeds(subType?: string, n = 10): Promise<{ domain: string; name: string }[]> {
  const base = db.select({ domain: companies.domain, name: companies.name, sub: companies.subType })
    .from(companies)
    .where(sql`${companies.domain} is not null and ${companies.domain} <> ''`);
  const rows = await base.limit(500);
  const filtered = subType ? rows.filter((r) => r.sub === subType) : rows;
  // simple spread: take evenly across the filtered set
  const step = Math.max(1, Math.floor(filtered.length / n));
  const picks: { domain: string; name: string }[] = [];
  for (let i = 0; i < filtered.length && picks.length < n; i += step) {
    picks.push({ domain: filtered[i].domain as string, name: (filtered[i].name as string) ?? '' });
  }
  return picks;
}

export interface DiscoverResult {
  found: number;
  newCompanies: number;
  alreadyKnown: number;
  errors: number;
  planGated?: boolean;
  message?: string;
}

/**
 * Run lookalike discovery. seedDomains drive the search; subType (optional) tags the
 * new companies; size caps how many to fetch. New companies are resolved into the store.
 */
export async function discoverLookalikes(
  opts: { seedDomains: string[]; subType?: string; size?: number; minScore?: number },
  log: (m: string) => void = console.log,
): Promise<DiscoverResult> {
  const seeds = opts.seedDomains.map(normDomain).filter(Boolean);
  if (!seeds.length) return { found: 0, newCompanies: 0, alreadyKnown: 0, errors: 0, message: 'No seed domains provided' };

  let results: OceanCompany[];
  try {
    log(`Searching Ocean for companies like: ${seeds.slice(0, 5).join(', ')}${seeds.length > 5 ? '…' : ''}`);
    const r = await searchCompanies({ lookalikeDomains: seeds, size: opts.size ?? 25, minScore: opts.minScore ?? 0.9 });
    results = r.companies;
  } catch (e) {
    const msg = (e as Error).message;
    // Ocean returns this when the plan doesn't include lookalike search.
    if (msg.includes('Plan version not supported') || msg.includes('400')) {
      return {
        found: 0, newCompanies: 0, alreadyKnown: 0, errors: 0, planGated: true,
        message: 'Ocean lookalike search is not available on the current Ocean plan. '
          + 'Company enrichment still works; lookalike discovery needs a plan that includes search.',
      };
    }
    throw e;
  }

  log(`Ocean returned ${results.length} candidate companies`);
  const candidateDomains = results.map(domainOf).filter(Boolean);
  // which already exist?
  const existing = candidateDomains.length
    ? await db.select({ domain: companies.domain }).from(companies).where(inArray(companies.domain, candidateDomains))
    : [];
  const known = new Set(existing.map((e) => e.domain));

  let newCompanies = 0, alreadyKnown = 0, errors = 0;
  for (const c of results) {
    const domain = domainOf(c);
    if (!domain) { errors++; continue; }
    if (known.has(domain)) { alreadyKnown++; continue; }
    try {
      await resolveCompany({
        name: c.name, domain,
        // HubSpot taxonomy: Type = ESO (fixed for this audience), Sub-type = the category.
        type: 'ESO', subType: opts.subType, audienceType: 'Entrepreneurs',
        sizeEmployees: c.companySize, foundedYear: c.yearFounded,
        sector: (c.industries ?? []).slice(0, 2).join(', '),
        country: c.primaryCountry,
      }, 'ocean_lookalike');
      newCompanies++;
    } catch (e) {
      errors++;
      if (errors <= 5) log(`  resolve error for ${domain}: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  return { found: results.length, newCompanies, alreadyKnown, errors };
}
