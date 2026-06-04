/**
 * Data hygiene stage — free, deterministic cleanups on data already in the store.
 * Each task exposes an `analyze` (count candidates, $0 — for the UI's expectation-setting)
 * and a `run` (apply the fix). All free; no vendor calls.
 *
 *   associationRepair — link orphaned contacts to a company by email-domain → company-domain
 *   personaBackfill   — tag contacts that have a title but no persona (keyword classifier)
 *   normalize         — canonicalize country / casing / domain formatting
 */
import { and, eq, isNull, isNotNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies, contacts, contactCompany } from '../../db/schema.js';
import { classifyPersona } from '../persona.js';

// ----------------------------------------------------------------- association repair
export async function analyzeAssociationRepair(): Promise<{ candidates: number }> {
  const [{ n }] = await db.execute<{ n: number }>(sql`
    with orphan as (
      select ct.id, lower(split_part(ct.email,'@',2)) edom
      from contacts ct left join contact_company cc on cc.contact_id=ct.id
      where cc.id is null and ct.email is not null and ct.email <> ''
    )
    select count(*)::int n from orphan o
    where exists (select 1 from companies c where lower(c.domain)=o.edom and c.domain<>'')
  `) as unknown as { n: number }[];
  return { candidates: Number(n) };
}

export async function runAssociationRepair(log: (m: string) => void = console.log): Promise<{ linked: number }> {
  // Link each orphaned contact to the (unique) company sharing its email domain.
  const res = await db.execute(sql`
    with orphan as (
      select ct.id cid, lower(split_part(ct.email,'@',2)) edom
      from contacts ct left join contact_company cc on cc.contact_id=ct.id
      where cc.id is null and ct.email is not null and ct.email <> ''
    ),
    matched as (
      select o.cid, (select c.id from companies c where lower(c.domain)=o.edom and c.domain<>'' limit 1) as company_id
      from orphan o
    )
    insert into contact_company (contact_id, company_id)
    select cid, company_id from matched where company_id is not null
    on conflict do nothing
    returning id
  `);
  const linked = Array.isArray(res) ? res.length : 0;
  log(`Linked ${linked} contacts to companies by email domain.`);
  return { linked };
}

// ----------------------------------------------------------------- persona backfill
export async function analyzePersonaBackfill(): Promise<{ candidates: number }> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts)
    .where(and(or(isNull(contacts.persona), eq(contacts.persona, '')),
      isNotNull(contacts.jobTitle), ne(contacts.jobTitle, '')));
  return { candidates: Number(n) };
}

export async function runPersonaBackfill(log: (m: string) => void = console.log): Promise<{ tagged: number }> {
  const rows = await db.select({ id: contacts.id, jobTitle: contacts.jobTitle }).from(contacts)
    .where(and(or(isNull(contacts.persona), eq(contacts.persona, '')),
      isNotNull(contacts.jobTitle), ne(contacts.jobTitle, '')));
  let tagged = 0;
  for (let i = 0; i < rows.length; i++) {
    const persona = classifyPersona(rows[i].jobTitle);
    if (persona) { await db.update(contacts).set({ persona }).where(eq(contacts.id, rows[i].id)); tagged++; }
    if ((i + 1) % 1000 === 0) log(`  processed ${i + 1}/${rows.length} (${tagged} tagged)…`);
  }
  log(`Tagged ${tagged} contacts with a persona.`);
  return { tagged };
}

// ----------------------------------------------------------------- normalization
const COUNTRY_MAP: Record<string, string> = {
  'us': 'United States', 'usa': 'United States', 'u.s.': 'United States', 'u.s.a.': 'United States',
  'united states of america': 'United States', 'america': 'United States',
  'uk': 'United Kingdom', 'u.k.': 'United Kingdom', 'great britain': 'United Kingdom',
  'ca': 'Canada', 'can': 'Canada',
};
export async function analyzeNormalize(): Promise<{ candidates: number }> {
  const variants = Object.keys(COUNTRY_MAP);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(companies)
    .where(sql`lower(trim(country)) = any(${variants})`);
  return { candidates: Number(n) };
}
export async function runNormalize(log: (m: string) => void = console.log): Promise<{ normalized: number }> {
  let normalized = 0;
  for (const [variant, canonical] of Object.entries(COUNTRY_MAP)) {
    const res = await db.update(companies).set({ country: canonical })
      .where(sql`lower(trim(country)) = ${variant}`).returning({ id: companies.id });
    normalized += Array.isArray(res) ? res.length : 0;
  }
  log(`Normalized ${normalized} company country values.`);
  return { normalized };
}
