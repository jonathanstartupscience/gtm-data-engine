/**
 * Enrich stage — fill firmographic gaps on companies via Ocean.io enrich.
 * Targets companies that have a domain but are missing size / founded year / sector.
 * Updates the store (never blanks existing data) + records provenance.
 */
import { and, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies, companyFieldHistory } from '../../db/schema.js';
import { enrichCompany, creditBalance, domainOf } from '../adapters/ocean.js';

/** Companies with a usable domain but missing key firmographics (enrich candidates). */
export async function companiesNeedingEnrichment(limit = 1000): Promise<{ id: number; domain: string }[]> {
  const rows = await db
    .select({ id: companies.id, domain: companies.domain })
    .from(companies)
    .where(and(
      isNotNull(companies.domain),
      ne(companies.domain, ''),
      or(isNull(companies.sizeEmployees), isNull(companies.foundedYear), isNull(companies.sector)),
    ))
    .limit(limit);
  return rows.filter((r) => r.domain) as { id: number; domain: string }[];
}

/** Map Ocean's response onto our company fields (only fields we care about). */
function mapOcean(o: Record<string, unknown>): Partial<typeof companies.$inferInsert> {
  const out: Partial<typeof companies.$inferInsert> = {};
  if (o.companySize) out.sizeEmployees = String(o.companySize);
  if (o.yearFounded) out.foundedYear = String(o.yearFounded);
  const inds = (o.industries as string[] | undefined) ?? (o.industryCategories as string[] | undefined);
  if (inds?.length) out.sector = inds.slice(0, 2).join(', ');
  if (o.primaryCountry && typeof o.primaryCountry === 'string') out.country = out.country; // don't overwrite geo
  return out;
}

export async function enrichCompanies(
  targets: { id: number; domain: string }[],
  log: (m: string) => void = console.log,
): Promise<{ attempted: number; enriched: number; filledFields: number; errors: number }> {
  let enriched = 0, filledFields = 0, errors = 0;
  for (let i = 0; i < targets.length; i++) {
    const { id, domain } = targets[i];
    try {
      const o = await enrichCompany(domain);
      const patch = mapOcean(o as Record<string, unknown>);
      // Only fill fields that are currently empty (never blank/overwrite).
      const [cur] = await db.select().from(companies).where(eq(companies.id, id));
      const toSet: Record<string, string> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v && !(cur as Record<string, unknown>)[k]) toSet[k] = String(v);
      }
      if (Object.keys(toSet).length) {
        await db.update(companies).set({ ...toSet, updatedAt: new Date() }).where(eq(companies.id, id));
        for (const [field, value] of Object.entries(toSet)) {
          await db.insert(companyFieldHistory).values({ companyId: id, field, value, source: 'ocean_enrich' });
          filledFields++;
        }
        enriched++;
      }
    } catch (e) {
      errors++;
      if (errors <= 5) log(`  enrich error for ${domain}: ${(e as Error).message.slice(0, 100)}`);
    }
    if ((i + 1) % 25 === 0) log(`  enriched ${i + 1}/${targets.length} (${filledFields} fields filled)`);
  }
  return { attempted: targets.length, enriched, filledFields, errors };
}

/** Preflight: Ocean credit balance (so the UI can warn before spending). */
export async function enrichPreflight(): Promise<{ candidates: number; oceanCredits: number }> {
  const [candidates, bal] = await Promise.all([
    companiesNeedingEnrichment(100000).then((r) => r.length),
    creditBalance().then((b) => (b.credits?.oneTime ?? 0) + (b.credits?.recurrent ?? 0)).catch(() => -1),
  ]);
  return { candidates, oceanCredits: bal };
}

void domainOf; // (available for future lookalike use)
