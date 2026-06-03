/** Import API: preview a CSV (headers + sample + auto-mapping), then run the import
 *  with SSE live progress. CSV text is sent as JSON (no multipart dep needed). */
import { Router } from 'express';
import { parse } from 'csv-parse/sync';
import { runImportList } from '../../engine/recipes.js';
import type { EntityType, Mapping } from '../../engine/stages/ingest.js';
import { validateBody, rateLimit, importPreviewSchema, importRunSchema } from '../validate.js';

export const importRouter = Router();

const MAX_ROWS = 100_000;

/** Canonical fields we can map to, per entity type. */
const FIELDS: Record<EntityType, string[]> = {
  company: ['name', 'domain', 'website', 'type', 'subType', 'audienceType', 'country',
    'state', 'city', 'linkedinUrl', 'foundedYear', 'sizeEmployees', 'sector', 'hubspotId'],
  contact: ['firstName', 'lastName', 'email', 'jobTitle', 'persona', 'linkedinUrl',
    'companyDomain', 'hubspotId'],
};

/** Heuristic: guess which CSV column maps to each canonical field by name similarity. */
function autoMap(headers: string[], entityType: EntityType): Mapping {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const h = headers.map((x) => ({ raw: x, n: norm(x) }));
  const find = (...cands: string[]) => h.find((x) => cands.some((c) => x.n === c || x.n.includes(c)))?.raw;
  const m: Mapping = {};
  const set = (field: string, col?: string) => { if (col) m[field] = col; };
  if (entityType === 'company') {
    set('name', find('companyname', 'company', 'name', 'organization', 'account'));
    set('domain', find('domain', 'website', 'url', 'site'));
    set('website', find('website', 'url'));
    set('subType', find('subtype', 'type', 'category'));
    set('country', find('country')); set('state', find('state', 'region'));
    set('city', find('city')); set('linkedinUrl', find('linkedin'));
    set('foundedYear', find('founded', 'year')); set('sizeEmployees', find('size', 'employees', 'headcount'));
    set('sector', find('sector', 'industry')); set('hubspotId', find('hubspotid', 'hubspot', 'recordid'));
  } else {
    set('firstName', find('firstname', 'first', 'fname', 'givenname'));
    set('lastName', find('lastname', 'last', 'lname', 'surname', 'familyname'));
    set('email', find('email', 'emailaddress')); set('jobTitle', find('jobtitle', 'title', 'position', 'role'));
    set('persona', find('persona')); set('linkedinUrl', find('linkedin'));
    set('companyDomain', find('companydomain', 'domain', 'companywebsite', 'website'));
    set('hubspotId', find('hubspotid', 'hubspot', 'contactid', 'recordid'));
  }
  return m;
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^﻿/, '');
  const rows = parse(clean, {
    columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true,
  }) as Record<string, string>[];
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

/** Keep only mapping entries whose key is a known field for this entity type. */
function safeMapping(mapping: Mapping, et: EntityType): Mapping {
  const allowed = new Set(FIELDS[et]);
  const out: Mapping = {};
  for (const [k, v] of Object.entries(mapping)) if (allowed.has(k) && typeof v === 'string') out[k] = v;
  return out;
}

/** Preview: returns headers, a few sample rows, total count, and a suggested mapping. */
importRouter.post('/preview', rateLimit(30, 60_000), validateBody(importPreviewSchema), (req, res) => {
  const { csv, entityType } = req.body as { csv: string; entityType: EntityType };
  try {
    const { headers, rows } = parseCsv(csv);
    if (rows.length > MAX_ROWS) { res.status(413).json({ error: `Too many rows (max ${MAX_ROWS})` }); return; }
    res.json({
      headers, total: rows.length, sample: rows.slice(0, 5),
      fields: FIELDS[entityType], mapping: autoMap(headers, entityType),
    });
  } catch {
    res.status(400).json({ error: 'Could not parse CSV — check the file format' });
  }
});

/** Run import with SSE progress. Body: { csv, entityType, mapping, sourceName }. */
importRouter.post('/run', rateLimit(10, 60_000), validateBody(importRunSchema), async (req, res) => {
  const { csv, entityType, mapping, sourceName } = req.body as
    { csv: string; entityType: EntityType; mapping: Mapping; sourceName?: string };
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  let aborted = false;
  req.on('close', () => { aborted = true; });
  const send = (event: string, data: unknown) => {
    if (aborted || res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const log = (m: string) => send('log', { message: m });
  try {
    const { rows } = parseCsv(csv);
    if (rows.length > MAX_ROWS) { send('error', { message: `Too many rows (max ${MAX_ROWS})` }); return; }
    const result = await runImportList(
      rows, entityType, safeMapping(mapping ?? {}, entityType), sourceName || 'CSV upload', log);
    send('done', result);
  } catch (err) {
    console.error('[import/run] error:', (err as Error).stack ?? err);
    send('error', { message: 'Import failed — see server logs' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});
