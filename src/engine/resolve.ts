/**
 * Identity resolution service — the heart of the canonical store.
 * Takes a normalized company/contact and upserts it into a golden record,
 * matching against existing identifiers (domain/email/name+domain/linkedin).
 * Records provenance in *_field_history. Reusable by every pipeline stage.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  companies, companyIdentifiers, companyFieldHistory,
  contacts, contactIdentifiers, contactFieldHistory, contactCompany,
} from '../db/schema.js';
import { normDomain, normEmail, normLinkedin, nameDomainKey, isValidEmail } from './normalize.js';

export interface CompanyInput {
  name?: string; domain?: string; website?: string; type?: string; subType?: string;
  audienceType?: string; country?: string; state?: string; city?: string;
  linkedinUrl?: string; foundedYear?: string; sizeEmployees?: string; sector?: string;
  focus?: string; hubspotId?: string;
  // Expanded HubSpot fields (optional).
  lifecycleStage?: string; leadStatus?: string; ownerId?: string; industry?: string;
  revenue?: string; employeeCount?: number; phone?: string; zip?: string;
  hsCreatedAt?: Date; hsLastActivityAt?: Date;
  propertiesJson?: Record<string, unknown>;
}

export interface ContactInput {
  firstName?: string; lastName?: string; email?: string; jobTitle?: string;
  persona?: string; linkedinUrl?: string; emailStatus?: string; hubspotId?: string;
  companyDomain?: string;
  lifecycleStage?: string; leadStatus?: string; ownerId?: string; seniority?: string;
  phone?: string; city?: string; state?: string; country?: string; source?: string;
  hsCreatedAt?: Date; hsLastActivityAt?: Date;
  propertiesJson?: Record<string, unknown>;
}

const clean = (v?: string) => (v && v.trim() ? v.trim() : null);

/** Find a company id by any identifier, or null. */
async function findCompanyId(domain: string, linkedin: string, hubspotId?: string): Promise<number | null> {
  if (domain) {
    const r = await db.select({ id: companies.id }).from(companies).where(eq(companies.domain, domain)).limit(1);
    if (r.length) return r[0].id;
  }
  for (const [kind, value] of [['linkedin', linkedin], ['hubspot_id', hubspotId ?? '']] as const) {
    if (!value) continue;
    const r = await db.select({ id: companyIdentifiers.companyId }).from(companyIdentifiers)
      .where(and(eq(companyIdentifiers.kind, kind), eq(companyIdentifiers.value, value))).limit(1);
    if (r.length) return r[0].id;
  }
  return null;
}

/** Upsert a company; returns its golden id. `source` is recorded in field history. */
export async function resolveCompany(input: CompanyInput, source: string): Promise<number> {
  const domain = normDomain(input.domain);
  const linkedin = normLinkedin(input.linkedinUrl);
  let id = await findCompanyId(domain, linkedin, input.hubspotId);

  const values = {
    name: clean(input.name), domain: domain || null, website: clean(input.website),
    type: clean(input.type), subType: clean(input.subType), audienceType: clean(input.audienceType),
    country: clean(input.country), state: clean(input.state), city: clean(input.city),
    linkedinUrl: clean(input.linkedinUrl), foundedYear: clean(input.foundedYear),
    sizeEmployees: clean(input.sizeEmployees), sector: clean(input.sector), focus: clean(input.focus),
    hubspotId: clean(input.hubspotId),
    lifecycleStage: clean(input.lifecycleStage), leadStatus: clean(input.leadStatus),
    ownerId: clean(input.ownerId), industry: clean(input.industry), revenue: clean(input.revenue),
    employeeCount: Number.isFinite(input.employeeCount) ? input.employeeCount! : null,
    phone: clean(input.phone), zip: clean(input.zip),
    hsCreatedAt: input.hsCreatedAt ?? null, hsLastActivityAt: input.hsLastActivityAt ?? null,
    propertiesJson: input.propertiesJson && Object.keys(input.propertiesJson).length ? input.propertiesJson : null,
    updatedAt: new Date(),
  };

  if (id) {
    // Only overwrite fields we have a (non-null) value for — never blank existing data.
    const patch = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null));
    if (Object.keys(patch).length > 1) await db.update(companies).set(patch).where(eq(companies.id, id));
  } else {
    const [ins] = await db.insert(companies).values(values).returning({ id: companies.id });
    id = ins.id;
  }

  // identifiers
  const idents = [
    domain && { companyId: id, kind: 'domain', value: domain },
    linkedin && { companyId: id, kind: 'linkedin', value: linkedin },
    input.hubspotId && { companyId: id, kind: 'hubspot_id', value: input.hubspotId },
  ].filter(Boolean) as { companyId: number; kind: string; value: string }[];
  for (const i of idents) await db.insert(companyIdentifiers).values(i).onConflictDoNothing();

  // provenance (record what this source supplied)
  for (const [field, value] of Object.entries(values)) {
    if (value && field !== 'updatedAt') {
      await db.insert(companyFieldHistory).values({ companyId: id, field, value: String(value), source });
    }
  }
  return id;
}

/** Upsert a contact; resolves email > name+domain > linkedin. Associates to company if given. */
export async function resolveContact(input: ContactInput, source: string): Promise<number> {
  const email = normEmail(input.email);
  const domain = normDomain(input.companyDomain);
  const liKey = normLinkedin(input.linkedinUrl);
  const nmKey = nameDomainKey(input.firstName ?? '', input.lastName ?? '', domain);

  let id: number | null = null;
  if (email) {
    const r = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.email, email)).limit(1);
    if (r.length) id = r[0].id;
  }
  for (const key of [nmKey, liKey]) {
    if (id || !key) continue;
    const r = await db.select({ id: contactIdentifiers.contactId }).from(contactIdentifiers)
      .where(eq(contactIdentifiers.value, key)).limit(1);
    if (r.length) id = r[0].id;
  }

  const values = {
    firstName: clean(input.firstName), lastName: clean(input.lastName), email: email || null,
    jobTitle: clean(input.jobTitle), persona: clean(input.persona), linkedinUrl: clean(input.linkedinUrl),
    emailStatus: clean(input.emailStatus), hubspotId: clean(input.hubspotId),
    lifecycleStage: clean(input.lifecycleStage), leadStatus: clean(input.leadStatus),
    ownerId: clean(input.ownerId), seniority: clean(input.seniority), phone: clean(input.phone),
    city: clean(input.city), state: clean(input.state), country: clean(input.country),
    source: clean(input.source),
    hsCreatedAt: input.hsCreatedAt ?? null, hsLastActivityAt: input.hsLastActivityAt ?? null,
    propertiesJson: input.propertiesJson && Object.keys(input.propertiesJson).length ? input.propertiesJson : null,
    updatedAt: new Date(),
  };

  if (id) {
    const patch = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null));
    if (Object.keys(patch).length > 1) await db.update(contacts).set(patch).where(eq(contacts.id, id));
  } else if (values.email) {
    // Race-safe insert by email. We can't use ON CONFLICT against a PARTIAL unique index
    // (target predicate wouldn't match), so try-insert and fall back to update-by-email if a
    // concurrent writer already created it.
    try {
      const [ins] = await db.insert(contacts).values(values).returning({ id: contacts.id });
      id = ins.id;
    } catch {
      const patch = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null));
      const r = await db.select({ id: contacts.id }).from(contacts).where(eq(contacts.email, values.email)).limit(1);
      if (r.length) {
        id = r[0].id;
        if (Object.keys(patch).length > 1) await db.update(contacts).set(patch).where(eq(contacts.id, id));
      } else { throw new Error('contact insert failed and no existing email match'); }
    }
  } else {
    const [ins] = await db.insert(contacts).values(values).returning({ id: contacts.id });
    id = ins.id;
  }

  const idents = [
    email && { contactId: id, kind: 'email', value: email },
    nmKey && { contactId: id, kind: 'name_domain_key', value: nmKey },
    liKey && { contactId: id, kind: 'linkedin', value: liKey },
    input.hubspotId && { contactId: id, kind: 'hubspot_id', value: input.hubspotId },
  ].filter(Boolean) as { contactId: number; kind: string; value: string }[];
  for (const i of idents) await db.insert(contactIdentifiers).values(i).onConflictDoNothing();

  for (const [field, value] of Object.entries(values)) {
    if (value && field !== 'updatedAt') {
      await db.insert(contactFieldHistory).values({ contactId: id, field, value: String(value), source });
    }
  }

  if (domain) {
    const c = await db.select({ id: companies.id }).from(companies).where(eq(companies.domain, domain)).limit(1);
    if (c.length) {
      await db.insert(contactCompany).values({ contactId: id, companyId: c[0].id }).onConflictDoNothing();
    }
  }
  void isValidEmail; // (kept for callers; validity gating happens in verify stage)
  return id;
}
