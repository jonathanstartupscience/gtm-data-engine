/**
 * Seed the canonical store with the ESO run's output, exercising real identity
 * resolution. This both (a) gives us real data to build against and (b) proves
 * the resolution logic end-to-end. Idempotent: re-running upserts, never duplicates.
 *
 * Usage: npm run seed:eso   (requires DATABASE_URL)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse } from 'csv-parse/sync';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/index.js';
import {
  sources, companies, companyIdentifiers, contacts, contactIdentifiers, contactCompany,
  verifications,
} from '../src/db/schema.js';
import { normDomain, normEmail, normLinkedin, nameDomainKey, isValidEmail } from '../src/engine/normalize.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

function readCsv(file: string): Record<string, string>[] {
  const text = readFileSync(join(DATA, file), 'utf8').replace(/^﻿/, '');
  return parse(text, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
}

async function upsertCompany(row: Record<string, string>): Promise<number> {
  const domain = normDomain(row.domain);
  // resolve by domain
  const existing = domain
    ? await db.select().from(companies).where(eq(companies.domain, domain)).limit(1)
    : [];
  const values = {
    name: row.company_name || null,
    domain: domain || null,
    website: row.website || null,
    type: row.type || null,
    subType: row.sub_type || null,
    audienceType: row.audience_type || null,
    country: row.country || null,
    state: row.state || null,
    city: row.city || null,
    linkedinUrl: row.linkedin_url || null,
    foundedYear: row.founded_year || null,
    sizeEmployees: row.size_employees || null,
    sector: row.sector || null,
    focus: row.focus || null,
    hubspotId: row.hubspot_company_id || null,
    updatedAt: new Date(),
  };
  let id: number;
  if (existing.length) {
    id = existing[0].id;
    await db.update(companies).set(values).where(eq(companies.id, id));
  } else {
    const [ins] = await db.insert(companies).values(values).returning({ id: companies.id });
    id = ins.id;
  }
  // identifiers (ignore conflicts)
  const idents = [
    domain && { companyId: id, kind: 'domain', value: domain },
    row.hubspot_company_id && { companyId: id, kind: 'hubspot_id', value: row.hubspot_company_id },
    row.linkedin_url && { companyId: id, kind: 'linkedin', value: normLinkedin(row.linkedin_url) },
  ].filter(Boolean) as { companyId: number; kind: string; value: string }[];
  for (const i of idents) await db.insert(companyIdentifiers).values(i).onConflictDoNothing();
  return id;
}

async function upsertContact(row: Record<string, string>, companyByDomain: Map<string, number>): Promise<void> {
  const email = normEmail(row.email);
  const domain = normDomain(row.company_domain);
  const liKey = normLinkedin(row.linkedin_url);
  const nmKey = nameDomainKey(row.first_name, row.last_name, domain);

  // resolve: email > name+domain > linkedin
  let id: number | null = null;
  if (email) {
    const r = await db.select().from(contacts).where(eq(contacts.email, email)).limit(1);
    if (r.length) id = r[0].id;
  }
  if (!id && nmKey) {
    const r = await db.select().from(contactIdentifiers)
      .where(eq(contactIdentifiers.value, nmKey)).limit(1);
    if (r.length) id = r[0].contactId;
  }
  if (!id && liKey) {
    const r = await db.select().from(contactIdentifiers)
      .where(eq(contactIdentifiers.value, liKey)).limit(1);
    if (r.length) id = r[0].contactId;
  }

  const values = {
    firstName: row.first_name || null,
    lastName: row.last_name || null,
    email: email || null,
    jobTitle: row.job_title || null,
    persona: row.persona || null,
    linkedinUrl: row.linkedin_url || null,
    emailStatus: row.email_status || null,
    hubspotId: row.hubspot_contact_id || null,
    updatedAt: new Date(),
  };
  if (id) {
    await db.update(contacts).set(values).where(eq(contacts.id, id));
  } else {
    const [ins] = await db.insert(contacts).values(values).returning({ id: contacts.id });
    id = ins.id;
  }

  const idents = [
    email && { contactId: id, kind: 'email', value: email },
    nmKey && { contactId: id, kind: 'name_domain_key', value: nmKey },
    liKey && { contactId: id, kind: 'linkedin', value: liKey },
    row.hubspot_contact_id && { contactId: id, kind: 'hubspot_id', value: row.hubspot_contact_id },
  ].filter(Boolean) as { contactId: number; kind: string; value: string }[];
  for (const i of idents) await db.insert(contactIdentifiers).values(i).onConflictDoNothing();

  // association
  const companyId = companyByDomain.get(domain);
  if (companyId) {
    await db.insert(contactCompany).values({ contactId: id, companyId }).onConflictDoNothing();
  }

  // verification cache (so we never re-verify within TTL)
  if (isValidEmail(email) && row.email_status) {
    await db.insert(verifications).values({
      email,
      status: row.email_status === 'risky_catchall' ? 'risky' : row.email_status,
      score: row.bouncer_score ? Number(row.bouncer_score) : null,
      acceptAll: row.email_status === 'risky_catchall',
      roleBased: row.email_status === 'role_based',
    }).onConflictDoNothing();
  }
}

async function main() {
  console.log('Seeding canonical store from ESO output…');
  const [src] = await db.insert(sources)
    .values({ name: 'ESO run (seed)', type: 'csv', meta: { note: 'initial seed from ESO pipeline output' } })
    .returning({ id: sources.id });
  console.log(`source id=${src.id}`);

  const compRows = readCsv('final_companies_hubspot.csv');
  console.log(`companies: ${compRows.length}`);
  const companyByDomain = new Map<string, number>();
  let c = 0;
  for (const row of compRows) {
    const id = await upsertCompany(row);
    const d = normDomain(row.domain);
    if (d) companyByDomain.set(d, id);
    if (++c % 100 === 0) console.log(`  ${c}/${compRows.length} companies`);
  }

  const contactRows = readCsv('final_contacts_master.csv');
  console.log(`contacts: ${contactRows.length}`);
  let k = 0;
  for (const row of contactRows) {
    await upsertContact(row, companyByDomain);
    if (++k % 250 === 0) console.log(`  ${k}/${contactRows.length} contacts`);
  }

  const compCount = await db.select().from(companies);
  const conCount = await db.select().from(contacts);
  console.log(`\nDone. Store now has ${compCount.length} companies, ${conCount.length} contacts.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
