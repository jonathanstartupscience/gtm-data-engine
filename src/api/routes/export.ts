/** Export API: stream the filtered Companies/Contacts set as CSV (same filters as the list views). */
import { createHash } from 'node:crypto';
import { Router } from 'express';
import { and, asc, eq, ilike, inArray, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies, contacts, contactCompany } from '../../db/schema.js';
import { asyncHandler } from '../middleware.js';

export const exportRouter = Router();

/** Serialize a value as a CSV cell (quote + escape). */
function cell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.join(',')];
  for (const r of rows) lines.push(headers.map((h) => cell(r[h])).join(','));
  return '﻿' + lines.join('\r\n'); // UTF-8 BOM for Excel
}
function send(res: import('express').Response, filename: string, csv: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

const COMPANY_COLS = ['name', 'domain', 'website', 'type', 'subType', 'audienceType',
  'country', 'state', 'city', 'linkedinUrl', 'foundedYear', 'sizeEmployees', 'sector', 'hubspotId'];
const CONTACT_COLS = ['firstName', 'lastName', 'email', 'jobTitle', 'persona',
  'linkedinUrl', 'emailStatus', 'hubspotId'];

/** Export companies (respects q / subType / country filters). Cap at 100k rows. */
exportRouter.get('/companies', asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 200);
  const subType = String(req.query.subType ?? '').trim().slice(0, 64);
  const country = String(req.query.country ?? '').trim().slice(0, 64);
  const conds = [
    q ? or(ilike(companies.name, `%${q}%`), ilike(companies.domain, `%${q}%`)) : undefined,
    subType ? eq(companies.subType, subType) : undefined,
    country ? eq(companies.country, country) : undefined,
  ].filter(Boolean);
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db.select().from(companies).where(where).orderBy(asc(companies.name)).limit(100000);
  send(res, 'companies.csv', toCsv(COMPANY_COLS, rows as unknown as Record<string, unknown>[]));
}));

/** Export contacts (respects q / persona / emailStatus filters). Cap at 100k rows. */
exportRouter.get('/contacts', asyncHandler(async (req, res) => {
  const q = String(req.query.q ?? '').trim().slice(0, 200);
  const persona = String(req.query.persona ?? '').trim().slice(0, 64);
  const emailStatus = String(req.query.emailStatus ?? '').trim().slice(0, 32);
  const conds = [
    q ? or(ilike(contacts.firstName, `%${q}%`), ilike(contacts.lastName, `%${q}%`),
      ilike(contacts.email, `%${q}%`), ilike(contacts.jobTitle, `%${q}%`)) : undefined,
    persona ? eq(contacts.persona, persona) : undefined,
    emailStatus ? eq(contacts.emailStatus, emailStatus) : undefined,
  ].filter(Boolean);
  const where = conds.length ? and(...conds) : undefined;
  const rows = await db.select().from(contacts).where(where).orderBy(asc(contacts.lastName)).limit(100000);
  send(res, 'contacts.csv', toCsv(CONTACT_COLS, rows as unknown as Record<string, unknown>[]));
}));

const sha256 = (s: string) => createHash('sha256').update(s.trim().toLowerCase()).digest('hex');
const SENDABLE_AD = ['deliverable', 'risky_catchall', 'role_based']; // ads tolerate role inboxes

/**
 * Ad-audience export — for Meta / LinkedIn custom audiences. Includes a SHA-256-hashed
 * (lowercased) email column (what the platforms ingest) plus plaintext fields. Filterable
 * by persona / sub_type. Only contactable addresses (excludes undeliverable/unknown/no-email).
 */
exportRouter.get('/ad-audience', asyncHandler(async (req, res) => {
  const persona = String(req.query.persona ?? '').trim().slice(0, 64);
  const subType = String(req.query.subType ?? '').trim().slice(0, 64);
  const conds = [
    inArray(contacts.emailStatus, SENDABLE_AD),
    persona ? eq(contacts.persona, persona) : undefined,
  ].filter(Boolean);
  let rows = await db
    .select({
      email: contacts.email, firstName: contacts.firstName, lastName: contacts.lastName,
      companyName: companies.name, country: companies.country, subType: companies.subType,
    })
    .from(contacts)
    .leftJoin(contactCompany, eq(contactCompany.contactId, contacts.id))
    .leftJoin(companies, eq(companies.id, contactCompany.companyId))
    .where(and(...conds))
    .limit(100000);
  if (subType) rows = rows.filter((r) => r.subType === subType);
  const seen = new Set<string>();
  const out = rows
    .filter((r) => r.email && !seen.has(r.email) && seen.add(r.email))
    .map((r) => ({
      email: r.email, email_sha256: sha256(r.email!),
      first_name: r.firstName, last_name: r.lastName,
      company_name: r.companyName, country: r.country,
    }));
  send(res, 'ad_audience.csv',
    toCsv(['email', 'email_sha256', 'first_name', 'last_name', 'company_name', 'country'], out));
}));
