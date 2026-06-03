/**
 * Taxonomy service — the Type → Sub-type framework that the whole engine is organized
 * around (HubSpot-aligned). ESO is just the first Type; this generalizes to the full CRM.
 *
 * `type` is stored as HubSpot's INTERNAL value (e.g. "CUSTOMER"); users must see the LABEL
 * (e.g. "ESO"). TYPE_LABELS maps internal→label. The set of sub-types per type is derived
 * dynamically from what's actually in the store, so it stays correct as data grows.
 */
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { companies } from '../db/schema.js';

/** HubSpot internal type value → human label. Extend as new types come online. */
export const TYPE_LABELS: Record<string, string> = {
  CUSTOMER: 'ESO',
  // Future types (examples — fill in real HubSpot internal values as we add them):
  // PARTNER: 'Partner', VENDOR: 'Vendor', INVESTOR: 'Investor',
};

export function typeLabel(value: string | null | undefined): string {
  if (!value) return '';
  return TYPE_LABELS[value] ?? value;
}

/** Reverse: label → internal value (for filtering by the label the user picked). */
export function typeValue(label: string): string {
  const hit = Object.entries(TYPE_LABELS).find(([, l]) => l === label);
  return hit ? hit[0] : label;
}

export interface TaxonomyType {
  value: string;        // internal (e.g. CUSTOMER)
  label: string;        // human (e.g. ESO)
  count: number;
  subTypes: { value: string; count: number }[];
}

/** Build the full taxonomy from the store: each Type with its Sub-types + counts. */
export async function getTaxonomy(): Promise<TaxonomyType[]> {
  const rows = await db
    .select({
      type: companies.type,
      subType: companies.subType,
      n: sql<number>`count(*)::int`,
    })
    .from(companies)
    .groupBy(companies.type, companies.subType);

  const byType = new Map<string, TaxonomyType>();
  for (const r of rows) {
    const tv = r.type ?? '(unset)';
    if (!byType.has(tv)) byType.set(tv, { value: tv, label: typeLabel(tv), count: 0, subTypes: [] });
    const t = byType.get(tv)!;
    t.count += r.n;
    if (r.subType) t.subTypes.push({ value: r.subType, count: r.n });
  }
  for (const t of byType.values()) t.subTypes.sort((a, b) => b.count - a.count);
  return [...byType.values()].sort((a, b) => b.count - a.count);
}
