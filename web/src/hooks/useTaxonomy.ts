/**
 * Shared, refreshable taxonomy + company-facets store. Dropdown counts (Find Companies, Find
 * Contacts, Companies filters, etc.) come from here. Two problems this solves vs fetching in each
 * page's mount effect:
 *   1) one fetch shared across pages (not N duplicate calls)
 *   2) reactive refresh — after an operation changes the data (classify apply, pairing, a pull),
 *      call refreshTaxonomy() and every mounted dropdown re-renders with new counts.
 */
import { useEffect, useState } from 'react';
import { api, type TaxonomyType } from '../api.js';

type Facets = { subTypes: { v: string; n: number }[]; countries: { v: string; n: number }[] };

let typesCache: TaxonomyType[] | null = null;
let facetsCache: Facets | null = null;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function fetchAll(): Promise<void> {
  const [tax, fac] = await Promise.all([api.taxonomy(), api.companyFacets()]);
  typesCache = tax.types;
  facetsCache = fac;
  notify();
}

/** Force a re-fetch (call after any op that changes type/sub-type/country distribution). */
export function refreshTaxonomy(): Promise<void> {
  inflight = fetchAll().finally(() => { inflight = null; });
  return inflight;
}

/** Subscribe to the shared taxonomy + facets; fetches once on first use, refetches on refresh. */
export function useTaxonomy() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const rerender = () => setTick((t) => t + 1);
    listeners.add(rerender);
    if (!typesCache && !inflight) refreshTaxonomy();
    return () => { listeners.delete(rerender); };
  }, []);
  return { types: typesCache ?? [], facets: facetsCache, refresh: refreshTaxonomy };
}
