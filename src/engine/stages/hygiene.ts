/**
 * Data hygiene stage — free, deterministic cleanups on data already in the store.
 * Each task exposes an `analyze` (count candidates, $0 — for the UI's expectation-setting)
 * and a `run` (apply the fix). All free; no vendor calls.
 *
 *   associationRepair — link orphaned contacts to a company by email-domain → company-domain
 *   personaBackfill   — tag contacts that have a title but no persona (keyword classifier)
 *   normalize         — canonicalize country / casing / domain formatting
 */
import { and, eq, inArray, isNull, isNotNull, ne, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies, contacts, contactCompany, hubspotSync } from '../../db/schema.js';
import { classifyPersona } from '../persona.js';
import { inferTypeFromSubType } from '../icp-taxonomy.js';
import { typeValue } from '../taxonomy.js';
import { patchCompany } from '../adapters/hubspot.js';
import { config } from '../../lib/config.js';

// ----------------------------------------------------------------- association repair
// Drizzle's postgres-js db.execute returns the rows array directly.
async function execRows<T = Record<string, unknown>>(query: ReturnType<typeof sql>): Promise<T[]> {
  return (await db.execute(query)) as unknown as T[];
}

export async function analyzeAssociationRepair(): Promise<{ candidates: number }> {
  const rows = await execRows<{ n: number }>(sql`
    with orphan as (
      select ct.id, lower(split_part(ct.email,'@',2)) edom
      from contacts ct left join contact_company cc on cc.contact_id=ct.id
      where cc.id is null and ct.email is not null and ct.email <> ''
    )
    select count(*)::int n from orphan o
    where exists (select 1 from companies c where lower(c.domain)=o.edom and c.domain<>'')
  `);
  return { candidates: Number(rows[0]?.n ?? 0) };
}

export async function runAssociationRepair(log: (m: string) => void = console.log): Promise<{ linked: number }> {
  // Link each orphaned contact to the (unique) company sharing its email domain.
  const rows = await execRows<{ id: number }>(sql`
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
  const linked = rows.length;
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
  // inArray builds a proper IN(...) param list — avoids the record→text[] cast errors
  // that `= any(${array})` produced under postgres-js.
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(companies)
    .where(inArray(sql`lower(trim(${companies.country}))`, variants));
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

// ----------------------------------------------------------------- type ↔ sub-type pairing
// Deterministic: if a company has a Sub-type but no Type, set the Type from the ICP taxonomy
// (University→ESO, PE→Investor, …) and write it back to HubSpot. Companies missing BOTH are left
// for the AI Classify queue (analyzePairing reports that count too).
export async function analyzePairing(): Promise<{ candidates: number; pairable: number; bothMissing: number }> {
  const rows = await db.select({ subType: companies.subType }).from(companies)
    .where(and(or(isNull(companies.type), eq(companies.type, '')), isNotNull(companies.subType), ne(companies.subType, '')));
  const pairable = rows.filter((r) => inferTypeFromSubType(r.subType)).length;
  const [{ n: both }] = await db.select({ n: sql<number>`count(*)::int` }).from(companies)
    .where(and(or(isNull(companies.type), eq(companies.type, '')), or(isNull(companies.subType), eq(companies.subType, ''))));
  return { candidates: pairable, pairable, bothMissing: Number(both) };
}

export async function runPairing(log: (m: string) => void = console.log): Promise<{ paired: number; hubspotSynced: number; unresolved: number }> {
  const rows = await db.select({ id: companies.id, subType: companies.subType, hubspotId: companies.hubspotId }).from(companies)
    .where(and(or(isNull(companies.type), eq(companies.type, '')), isNotNull(companies.subType), ne(companies.subType, '')));
  const canPush = !!config.hubspotToken;
  let paired = 0, hubspotSynced = 0, unresolved = 0;
  for (let i = 0; i < rows.length; i++) {
    const inferred = inferTypeFromSubType(rows[i].subType);
    if (!inferred) { unresolved++; continue; }
    const internalType = typeValue(inferred.type); // label → stored internal value (ESO→CUSTOMER, etc.)
    // Normalize the sub-type to its canonical taxonomy label while we're here.
    await db.update(companies).set({ type: internalType, subType: inferred.subType, updatedAt: new Date() }).where(eq(companies.id, rows[i].id));
    paired++;
    if (canPush && rows[i].hubspotId) {
      try {
        await patchCompany(rows[i].hubspotId!, { type: internalType, sub_type: inferred.subType });
        await db.insert(hubspotSync).values({ entityType: 'company', entityId: rows[i].id, hubspotId: rows[i].hubspotId, action: 'patch', overwrote: `type=${internalType}` });
        hubspotSynced++;
      } catch { /* leave for a later sync */ }
    }
    if ((i + 1) % 100 === 0) log(`  paired ${paired}/${rows.length}…`);
  }
  log(`Paired ${paired} companies' Type from Sub-type (${hubspotSynced} synced to HubSpot, ${unresolved} sub-types unrecognized).`);
  return { paired, hubspotSynced, unresolved };
}
