/**
 * Discover Contacts stage — find NET-NEW people across ALL companies (not limited to the existing
 * account list), people-first, via Airscale's people search. This is the inverse of Find Contacts
 * (which is company-first): here we search by job title + keyword + location, paginate the results,
 * and resolve each discovered person into the store — creating their company if it's new.
 *
 * Email is intentionally NOT found here. Email-finding is the slow (~90s waterfall) and expensive
 * (~10x) step, so it is a separate, separately-confirmed action (see runFindEmailsForContacts).
 */
import { and, eq, isNull, or, sql, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies, contacts, contactCompany } from '../../db/schema.js';
import { searchPeople, findEmailsParallel, type PeopleQuery } from '../adapters/airscale.js';
import { resolveCompany, resolveContact } from '../resolve.js';
import { normDomain } from '../normalize.js';
import { classifyPersona } from '../persona.js';

/** Free-text people filters for a company-agnostic Airscale search. */
export interface DiscoverPeopleFilters {
  titlesInclude?: string[];
  titlesExclude?: string[];
  locations?: string[];          // city / region / country
  keyword?: string;              // matches title/bio/skills/education
  persona?: string;              // optional: only used to tag discovered contacts
}

/** Build a people-FIRST Airscale query (no companyDomain — that's the whole point here). */
function buildPeopleQuery(f: DiscoverPeopleFilters): PeopleQuery {
  const q: PeopleQuery = {};
  if (f.titlesInclude?.length || f.titlesExclude?.length) {
    q.JobTitle = { include: f.titlesInclude?.length ? f.titlesInclude : undefined, exclude: f.titlesExclude?.length ? f.titlesExclude : undefined };
  }
  if (f.locations?.length) q.location = { include: f.locations };
  if (f.keyword?.trim()) q.keyword = { include: [f.keyword.trim()] };
  return q;
}

export interface DiscoverScopeResult { total: number; estLeads: number; estCostUsd: number }

/** Cheap scope probe: a size=1 search reads Airscale's `total` for the query. */
export async function discoverContactsScope(
  f: DiscoverPeopleFilters,
  maxLeads: number,
  perLeadCost: number,
): Promise<DiscoverScopeResult> {
  const { total } = await searchPeople(buildPeopleQuery(f), 1);
  const estLeads = Math.min(total, maxLeads);
  return { total, estLeads, estCostUsd: +(estLeads * perLeadCost).toFixed(4) };
}

export interface DiscoverContactsResult {
  found: number; companiesCreated: number; added: number; noCompany: number; errors: number;
}

/**
 * Paginate the people search up to maxLeads and resolve each person into the store. A per-run cache
 * keyed by normalized domain avoids redundant resolveCompany calls when many leads share a company.
 * Net-new companies are left UNTYPED (industry only) — the classifier assigns type/sub-type later;
 * blind-tagging a people-first result would poison the taxonomy.
 */
export async function discoverContacts(
  opts: DiscoverPeopleFilters & { maxLeads?: number },
  log: (m: string) => void = console.log,
): Promise<DiscoverContactsResult> {
  const maxLeads = Math.min(Math.max(opts.maxLeads ?? 1000, 1), 5000);
  const query = buildPeopleQuery(opts);
  const companyCache = new Map<string, number>();
  let found = 0, companiesCreated = 0, added = 0, noCompany = 0, errors = 0;
  let cursor: string | undefined;

  log(`Searching Airscale for up to ${maxLeads} people${opts.titlesInclude?.length ? ` (${opts.titlesInclude.join(', ')})` : ''}${opts.keyword ? ` matching "${opts.keyword}"` : ''}…`);

  while (found < maxLeads) {
    const pageSize = Math.min(100, maxLeads - found);
    const { leads, nextCursor } = await searchPeople(query, pageSize, cursor);
    if (!leads.length) break;

    for (const ld of leads) {
      const first = (ld.firstname ?? '').trim();
      const last = (ld.lastname ?? '').trim();
      if (!first && !last) continue;
      found++;
      const title = (ld.jobTitle ?? ld.headline ?? '').trim();
      try {
        const domain = normDomain(ld.companyWebsite ?? '');
        if (domain) {
          if (!companyCache.has(domain)) {
            const before = companyCache.size;
            const companyId = await resolveCompany({
              name: ld.companyName, website: ld.companyWebsite, domain,
              industry: ld.companyIndustry, // factual; leave type/subType to the classifier
            }, 'airscale_discover');
            companyCache.set(domain, companyId);
            if (companyCache.size > before) companiesCreated++;
          }
        } else {
          noCompany++;
        }
        await resolveContact({
          firstName: first, lastName: last, jobTitle: title,
          persona: classifyPersona(title) || opts.persona || undefined,
          linkedinUrl: ld.profileUrl,
          companyDomain: domain || undefined,
        }, 'airscale_discover');
        added++;
      } catch (e) {
        errors++;
        if (errors <= 5) log(`  resolve error for ${first} ${last}: ${(e as Error).message.slice(0, 80)}`);
      }
    }

    log(`  ${found} people processed (${added} added, ${companiesCreated} new companies)…`);
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  // companiesCreated counts NEW cache entries, which overcounts (cache includes already-known
  // companies too). Report distinct companies touched instead — clearer and honest.
  return { found, companiesCreated: companyCache.size, added, noCompany, errors };
}

export interface FindEmailsResult { attempted: number; emailsFound: number; skipped: number; errors: number }

/** The contacts among `ids` that still lack an email AND have a resolvable company domain. */
export async function selectContactsNeedingEmail(ids: number[]): Promise<
  { id: number; firstName: string | null; lastName: string | null; linkedinUrl: string | null; companyName: string | null; domain: string | null }[]
> {
  if (!ids.length) return [];
  return db.select({
    id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName,
    linkedinUrl: contacts.linkedinUrl, companyName: companies.name, domain: companies.domain,
  })
    .from(contacts)
    .leftJoin(contactCompany, eq(contactCompany.contactId, contacts.id))
    .leftJoin(companies, eq(companies.id, contactCompany.companyId))
    .where(and(inArray(contacts.id, ids), or(isNull(contacts.email), eq(contacts.email, ''))));
}

/**
 * Find emails (Airscale waterfall) for the given contacts that lack one, then upsert the email +
 * status. Only contacts with a company domain are attempted (the waterfall needs a domain).
 */
export async function findEmailsForContacts(
  ids: number[],
  log: (m: string) => void = console.log,
): Promise<FindEmailsResult> {
  const rows = await selectContactsNeedingEmail(ids);
  const eligible = rows.filter((r) => (r.domain ?? '').trim() && (r.firstName || r.lastName));
  const skipped = ids.length - eligible.length;
  if (!eligible.length) { log('No selected contacts need an email (or none have a company domain).'); return { attempted: 0, emailsFound: 0, skipped, errors: 0 }; }

  log(`Finding emails for ${eligible.length} contact(s)…`);
  const results = await findEmailsParallel(
    eligible.map((r) => ({ firstName: r.firstName ?? undefined, lastName: r.lastName ?? undefined, domain: r.domain ?? undefined, companyName: r.companyName ?? undefined, linkedinUrl: r.linkedinUrl ?? undefined })),
    12,
    (done, total) => { if (done % 10 === 0 || done === total) log(`  ${done}/${total} looked up…`); },
  );

  let emailsFound = 0, errors = 0;
  for (let i = 0; i < eligible.length; i++) {
    const r = eligible[i];
    const res = results[i];
    if (!res || !res.email) { if (res?.email_status?.startsWith('error') || res?.email_status === 'lookup_error') errors++; continue; }
    try {
      await resolveContact({
        firstName: r.firstName ?? undefined, lastName: r.lastName ?? undefined,
        linkedinUrl: r.linkedinUrl ?? undefined, companyDomain: r.domain ?? undefined,
        email: res.email, emailStatus: res.email_status,
      }, 'airscale_email');
      emailsFound++;
    } catch { errors++; }
  }
  return { attempted: eligible.length, emailsFound, skipped, errors };
}

void sql;
