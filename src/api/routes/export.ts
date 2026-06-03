/** Export API: stream the filtered Companies/Contacts set as CSV (same filters as the list views). */
import { Router } from 'express';
import { and, asc, eq, ilike, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies, contacts } from '../../db/schema.js';
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
