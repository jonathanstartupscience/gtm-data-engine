/**
 * Canonical store schema (Drizzle / Postgres). See DATA_ENGINE_PLAN.md §3.
 *
 * Layers:
 *   sources / raw_records / staged_records   — ingestion (every input lands here)
 *   companies / contacts (+ identifiers, field_history, contact_company) — golden records
 *   verifications  — Bouncer de-bounce cache with TTL
 *   hubspot_sync / runs — activation + run history
 */
import {
  pgTable, serial, text, integer, real, timestamp, jsonb, boolean, uniqueIndex, index,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------- ingestion
export const sources = pgTable('sources', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type').notNull(), // csv | hubspot | airscale | ocean | origami | webhook
  meta: jsonb('meta'),
  ingestedAt: timestamp('ingested_at').defaultNow().notNull(),
});

export const rawRecords = pgTable(
  'raw_records',
  {
    id: serial('id').primaryKey(),
    sourceId: integer('source_id').references(() => sources.id).notNull(),
    entityType: text('entity_type').notNull(), // company | contact
    payload: jsonb('payload').notNull(), // exactly as received
    rowHash: text('row_hash').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => ({ srcIdx: index('raw_src_idx').on(t.sourceId), hashIdx: index('raw_hash_idx').on(t.rowHash) }),
);

export const stagedRecords = pgTable('staged_records', {
  id: serial('id').primaryKey(),
  rawId: integer('raw_id').references(() => rawRecords.id).notNull(),
  entityType: text('entity_type').notNull(),
  normalized: jsonb('normalized').notNull(), // typed + normalized fields
  resolvedCompanyId: integer('resolved_company_id'),
  resolvedContactId: integer('resolved_contact_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// ---------------------------------------------------------------- companies
export const companies = pgTable(
  'companies',
  {
    id: serial('id').primaryKey(),
    name: text('name'),
    domain: text('domain'),
    website: text('website'),
    type: text('type'), // e.g. ESO (HubSpot internal CUSTOMER)
    subType: text('sub_type'),
    audienceType: text('audience_type'),
    country: text('country'),
    state: text('state'),
    city: text('city'),
    linkedinUrl: text('linkedin_url'),
    foundedYear: text('founded_year'),
    sizeEmployees: text('size_employees'),
    sector: text('sector'),
    focus: text('focus'),
    hubspotId: text('hubspot_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({ domainIdx: uniqueIndex('companies_domain_idx').on(t.domain) }),
);

export const companyIdentifiers = pgTable(
  'company_identifiers',
  {
    id: serial('id').primaryKey(),
    companyId: integer('company_id').references(() => companies.id).notNull(),
    kind: text('kind').notNull(), // domain | linkedin | name_key | hubspot_id
    value: text('value').notNull(),
  },
  (t) => ({ kv: uniqueIndex('company_ident_kv_idx').on(t.kind, t.value) }),
);

export const companyFieldHistory = pgTable('company_field_history', {
  id: serial('id').primaryKey(),
  companyId: integer('company_id').references(() => companies.id).notNull(),
  field: text('field').notNull(),
  value: text('value'),
  source: text('source'),
  confidence: real('confidence'),
  ts: timestamp('ts').defaultNow().notNull(),
});

// ---------------------------------------------------------------- contacts
export const contacts = pgTable(
  'contacts',
  {
    id: serial('id').primaryKey(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    email: text('email'),
    jobTitle: text('job_title'),
    persona: text('persona'),
    linkedinUrl: text('linkedin_url'),
    emailStatus: text('email_status'), // deliverable | risky_catchall | role_based | ...
    hubspotId: text('hubspot_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({ emailIdx: index('contacts_email_idx').on(t.email) }),
);

export const contactIdentifiers = pgTable(
  'contact_identifiers',
  {
    id: serial('id').primaryKey(),
    contactId: integer('contact_id').references(() => contacts.id).notNull(),
    kind: text('kind').notNull(), // email | linkedin | name_domain_key | hubspot_id
    value: text('value').notNull(),
  },
  (t) => ({ kv: uniqueIndex('contact_ident_kv_idx').on(t.kind, t.value) }),
);

export const contactFieldHistory = pgTable('contact_field_history', {
  id: serial('id').primaryKey(),
  contactId: integer('contact_id').references(() => contacts.id).notNull(),
  field: text('field').notNull(),
  value: text('value'),
  source: text('source'),
  confidence: real('confidence'),
  ts: timestamp('ts').defaultNow().notNull(),
});

export const contactCompany = pgTable(
  'contact_company',
  {
    id: serial('id').primaryKey(),
    contactId: integer('contact_id').references(() => contacts.id).notNull(),
    companyId: integer('company_id').references(() => companies.id).notNull(),
    role: text('role'),
  },
  (t) => ({ pair: uniqueIndex('contact_company_pair_idx').on(t.contactId, t.companyId) }),
);

// ---------------------------------------------------------------- verification cache
export const verifications = pgTable(
  'verifications',
  {
    email: text('email').primaryKey(),
    status: text('status'), // deliverable | risky | undeliverable | unknown
    score: integer('score'),
    acceptAll: boolean('accept_all'),
    roleBased: boolean('role_based'),
    disposable: boolean('disposable'),
    reason: text('reason'),
    verifiedAt: timestamp('verified_at').defaultNow().notNull(),
    ttlDays: integer('ttl_days').default(90).notNull(),
  },
);

// ---------------------------------------------------------------- activation + runs
export const hubspotSync = pgTable('hubspot_sync', {
  id: serial('id').primaryKey(),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id').notNull(),
  hubspotId: text('hubspot_id'),
  action: text('action'), // patch | create | associate
  overwrote: text('overwrote'),
  lastSynced: timestamp('last_synced').defaultNow().notNull(),
});

export const runs = pgTable('runs', {
  id: serial('id').primaryKey(),
  kind: text('kind').notNull(), // recipe name: verify | enrich | discover | sync | full
  status: text('status').default('running').notNull(), // running | done | error
  stats: jsonb('stats'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
});
