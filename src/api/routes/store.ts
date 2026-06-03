/** Read API over the canonical store: stats, companies, contacts, company detail. */
import { Router } from 'express';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies, contacts, contactCompany } from '../../db/schema.js';
import { asyncHandler } from '../middleware.js';

export const store = Router();

/** Dashboard stats. */
store.get('/stats', asyncHandler(async (_req, res) => {
  const [[c], [k]] = await Promise.all([
    db.select({ n: count() }).from(companies),
    db.select({ n: count() }).from(contacts),
  ]);
  const bySubType = await db
    .select({ key: companies.subType, n: count() })
    .from(companies)
    .groupBy(companies.subType)
    .orderBy(desc(count()));
  const byPersona = await db
    .select({ key: contacts.persona, n: count() })
    .from(contacts)
    .groupBy(contacts.persona)
    .orderBy(desc(count()));
  const byEmailStatus = await db
    .select({ key: contacts.emailStatus, n: count() })
    .from(contacts)
    .groupBy(contacts.emailStatus)
    .orderBy(desc(count()));
  res.json({
    companies: c.n,
    contacts: k.n,
    bySubType: bySubType.filter((r) => r.key),
    byPersona: byPersona.filter((r) => r.key),
    byEmailStatus: byEmailStatus.filter((r) => r.key),
  });
}));

/** Parse + clamp pagination params (guards NaN / negative / oversized). */
function page(req: { query: Record<string, unknown> }) {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  return { limit, offset };
}

/** Distinct filter values for the Companies tab (sub_type, country). */
store.get('/companies/facets', asyncHandler(async (_req, res) => {
  const [subTypes, countries] = await Promise.all([
    db.select({ v: companies.subType, n: count() }).from(companies).groupBy(companies.subType).orderBy(desc(count())),
    db.select({ v: companies.country, n: count() }).from(companies).groupBy(companies.country).orderBy(desc(count())),
  ]);
  res.json({
    subTypes: subTypes.filter((r) => r.v),
    countries: countries.filter((r) => r.v).slice(0, 40),
  });
}));

/** Companies list with search + filters + pagination. */
store.get('/companies', asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 200);
  const subType = String(req.query.subType ?? '').trim().slice(0, 64);
  const country = String(req.query.country ?? '').trim().slice(0, 64);
  const { limit, offset } = page(req);
  const conds = [
    q ? or(ilike(companies.name, `%${q}%`), ilike(companies.domain, `%${q}%`)) : undefined,
    subType ? eq(companies.subType, subType) : undefined,
    country ? eq(companies.country, country) : undefined,
  ].filter(Boolean);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(companies).where(where).orderBy(companies.name).limit(limit).offset(offset),
    db.select({ n: count() }).from(companies).where(where),
  ]);
  res.json({ total: n, rows });
}));

/** Contacts list with search + filters + pagination. */
store.get('/contacts', asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 200);
  const persona = String(req.query.persona ?? '').trim().slice(0, 64);
  const emailStatus = String(req.query.emailStatus ?? '').trim().slice(0, 32);
  const { limit, offset } = page(req);
  const conds = [
    q ? or(ilike(contacts.firstName, `%${q}%`), ilike(contacts.lastName, `%${q}%`),
      ilike(contacts.email, `%${q}%`), ilike(contacts.jobTitle, `%${q}%`)) : undefined,
    persona ? eq(contacts.persona, persona) : undefined,
    emailStatus ? eq(contacts.emailStatus, emailStatus) : undefined,
  ].filter(Boolean);
  const where = conds.length ? and(...conds) : undefined;
  const [rows, [{ n }]] = await Promise.all([
    db.select().from(contacts).where(where).orderBy(contacts.lastName).limit(limit).offset(offset),
    db.select({ n: count() }).from(contacts).where(where),
  ]);
  res.json({ total: n, rows });
}));

/** Single company + its associated contacts. */
store.get('/companies/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: 'invalid id' }); return; }
  const [company] = await db.select().from(companies).where(eq(companies.id, id));
  if (!company) { res.status(404).json({ error: 'not found' }); return; }
  const people = await db
    .select()
    .from(contacts)
    .innerJoin(contactCompany, eq(contactCompany.contactId, contacts.id))
    .where(eq(contactCompany.companyId, id));
  res.json({ company, contacts: people.map((p) => p.contacts) });
}));
