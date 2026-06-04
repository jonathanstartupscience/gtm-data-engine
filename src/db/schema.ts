/**
 * Canonical store schema (Drizzle / Postgres). See DATA_ENGINE_PLAN.md §3.
 *
 * Layers:
 *   sources / raw_records / staged_records   — ingestion (every input lands here)
 *   companies / contacts (+ identifiers, field_history, contact_company) — golden records
 *   verifications  — Bouncer de-bounce cache with TTL
 *   hubspot_sync / runs — activation + run history
 */
import { sql } from 'drizzle-orm';
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
    // High-value HubSpot fields promoted to typed columns (filterable/segmentable).
    lifecycleStage: text('lifecycle_stage'),
    leadStatus: text('lead_status'),
    ownerId: text('owner_id'),
    industry: text('industry'),
    revenue: text('revenue'),
    employeeCount: integer('employee_count'),
    phone: text('phone'),
    zip: text('zip'),
    hsCreatedAt: timestamp('hs_created_at'),
    hsLastActivityAt: timestamp('hs_last_activity_at'),
    // Catch-all for ALL other HubSpot fields — no migration needed to retain them.
    propertiesJson: jsonb('properties_json'),
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
    // Promoted HubSpot fields.
    lifecycleStage: text('lifecycle_stage'),
    leadStatus: text('lead_status'),
    ownerId: text('owner_id'),
    seniority: text('seniority'),
    phone: text('phone'),
    city: text('city'),
    state: text('state'),
    country: text('country'),
    source: text('source'),
    hsCreatedAt: timestamp('hs_created_at'),
    hsLastActivityAt: timestamp('hs_last_activity_at'),
    propertiesJson: jsonb('properties_json'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => ({
    emailIdx: index('contacts_email_idx').on(t.email),
    // Unique on real emails only (NULL/'' excluded) so resolution can rely on it + onConflict.
    emailUniq: uniqueIndex('contacts_email_uniq').on(t.email).where(sql`email is not null and email <> ''`),
  }),
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

// ---------------------------------------------------------------- classification review queue
// AI-proposed type/sub_type for companies missing them. NEVER auto-applied — reviewed first.
export const classifyProposals = pgTable(
  'classify_proposals',
  {
    id: serial('id').primaryKey(),
    companyId: integer('company_id').references(() => companies.id).notNull(),
    proposedType: text('proposed_type'),
    proposedSubType: text('proposed_sub_type'),
    confidence: real('confidence'),
    reason: text('reason'),
    signal: text('signal'),         // what was read (ocean | homepage | both)
    status: text('status').default('pending').notNull(), // pending | approved | rejected | applied
    createdAt: timestamp('created_at').defaultNow().notNull(),
    reviewedAt: timestamp('reviewed_at'),
  },
  (t) => ({ companyIdx: uniqueIndex('classify_company_idx').on(t.companyId) }),
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

// ---------------------------------------------------------------- outbound (Email Bison)
// The engine is the source of truth for campaign *definitions* (templating/clone/compare);
// Email Bison remains the execution system. bisonCampaignId links our record to theirs.
export const bisonCampaigns = pgTable('bison_campaigns', {
  id: serial('id').primaryKey(),
  bisonCampaignId: integer('bison_campaign_id'), // id in Email Bison (null until created there)
  name: text('name').notNull(),
  status: text('status').default('draft').notNull(), // draft | created | active | paused | done
  persona: text('persona'),
  subType: text('sub_type'),
  scheduleJson: jsonb('schedule_json'),
  limitsJson: jsonb('limits_json'),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  syncedAt: timestamp('synced_at'),
});

export const bisonSequences = pgTable('bison_sequences', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').references(() => bisonCampaigns.id).notNull(),
  stepOrder: integer('step_order').notNull(),
  waitInDays: integer('wait_in_days').default(0).notNull(),
  subject: text('subject'),
  body: text('body'),
  variant: text('variant'),
  threadReply: boolean('thread_reply').default(false),
});

export const bisonSenderAssignments = pgTable('bison_sender_assignments', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').references(() => bisonCampaigns.id).notNull(),
  senderEmailId: integer('sender_email_id').notNull(),
  senderEmail: text('sender_email'),
  dailyLimit: integer('daily_limit'),
});

export const bisonCampaignStats = pgTable('bison_campaign_stats', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').references(() => bisonCampaigns.id).notNull(),
  capturedAt: timestamp('captured_at').defaultNow().notNull(),
  sent: integer('sent'),
  opens: integer('opens'),
  replies: integer('replies'),
  bounces: integer('bounces'),
  interested: integer('interested'),
  unsubscribed: integer('unsubscribed'),
  perStepJson: jsonb('per_step_json'),
});

// Reusable sequence templates — built independently in the Sequence Library, then COPIED into a
// campaign on attach (editing a campaign's copy never mutates the template). Enables A/B testing
// messaging across campaigns.
export const sequenceTemplates = pgTable('sequence_templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  persona: text('persona'),
  stepsJson: jsonb('steps_json').notNull(), // [{order, wait_in_days, email_subject, email_body, variant?, thread_reply?}]
  createdBy: text('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Captured replies (via Bison webhook + poll). Positive/interested replies are what we jump on.
export const bisonReplies = pgTable(
  'bison_replies',
  {
    id: serial('id').primaryKey(),
    campaignId: integer('campaign_id'),            // our bison_campaigns.id (best-effort link)
    bisonCampaignId: integer('bison_campaign_id'), // raw id from the event
    bisonReplyId: text('bison_reply_id'),          // dedup key from Bison (event/message id)
    leadEmail: text('lead_email'),
    leadName: text('lead_name'),
    subject: text('subject'),
    body: text('body'),
    sentiment: text('sentiment'),                  // interested | positive | neutral | negative | unknown
    isPositive: boolean('is_positive').default(false),
    status: text('status').default('new').notNull(), // new | read | handled
    receivedAt: timestamp('received_at').defaultNow().notNull(),
    raw: jsonb('raw'),
  },
  (t) => ({ dedup: uniqueIndex('bison_reply_dedup_idx').on(t.bisonReplyId) }),
);

export const bisonPushLog = pgTable('bison_push_log', {
  id: serial('id').primaryKey(),
  campaignId: integer('campaign_id').references(() => bisonCampaigns.id).notNull(),
  runId: integer('run_id'),
  leadsCreated: integer('leads_created'),
  leadsAttached: integer('leads_attached'),
  segmentFilterJson: jsonb('segment_filter_json'),
  at: timestamp('at').defaultNow().notNull(),
});

export const runs = pgTable('runs', {
  id: serial('id').primaryKey(),
  kind: text('kind').notNull(), // recipe name: verify | enrich | discover | sync | full
  status: text('status').default('running').notNull(), // running | done | error
  stats: jsonb('stats'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
});
