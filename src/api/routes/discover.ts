/** Discovery API: suggest seed companies + run lookalike discovery (SSE). Type/Sub-type aware. */
import { Router } from 'express';
import { z } from 'zod';
import { suggestSeeds } from '../../engine/stages/discover.js';
import { selectCompaniesForContactSearch } from '../../engine/stages/findContacts.js';
import { runDiscoverLookalikes, runFindContacts } from '../../engine/recipes.js';
import { costs } from '../../lib/config.js';
import { asyncHandler } from '../middleware.js';
import { rateLimit, validateBody } from '../validate.js';

export const discoverRouter = Router();

/** Scope for Find Contacts: how many companies match the company filters + est. Airscale cost. */
discoverRouter.get('/find-contacts/scope', rateLimit(30, 60_000), asyncHandler(async (req, res) => {
  const q = req.query;
  const persona = String(q.persona ?? '').slice(0, 64);
  if (!persona) { res.status(400).json({ error: 'persona required' }); return; }
  const sel = {
    type: q.type ? String(q.type).slice(0, 64) : undefined,
    subType: q.subType ? String(q.subType).slice(0, 64) : undefined,
    country: q.country ? String(q.country).slice(0, 64) : undefined,
    persona,
    onlyMissingPersona: q.onlyMissing === '1' || q.onlyMissing === 'true',
  };
  const matched = await selectCompaniesForContactSearch(sel, 100000);
  const perCompany = 2;
  const estPeople = matched.length * perCompany;
  res.json({
    candidates: matched.length,
    unit: sel.onlyMissingPersona ? `companies missing "${persona}"` : 'matching companies',
    estPeople, estCostUsd: estPeople * 0.1 * costs.airscaleEmailPerLookup, // find-people ~0.1cr/lead
    vendor: 'Airscale',
    what: `Sourcing up to ${perCompany} "${persona}" contacts at each of the ${matched.length.toLocaleString()} selected companies.`,
  });
}));

const findContactsSchema = z.object({
  confirm: z.literal(true),
  persona: z.string().min(1).max(64),
  type: z.string().max(64).optional(),
  subType: z.string().max(64).optional(),
  country: z.string().max(64).optional(),
  onlyMissingPersona: z.boolean().optional(),
  titles: z.array(z.string().max(80)).max(12).optional(),
  limitCompanies: z.number().int().min(1).max(100000).optional(),
});

/** Run Find Contacts (SSE). Requires confirm (spends Airscale). */
discoverRouter.post('/find-contacts', rateLimit(5, 60_000), validateBody(findContactsSchema), async (req, res) => {
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
  try {
    const result = await runFindContacts(req.body as z.infer<typeof findContactsSchema>, (m) => send('log', { message: m }));
    send('done', result);
  } catch (err) {
    console.error('[find-contacts] error:', (err as Error).stack ?? err);
    send('error', { message: 'Find contacts failed — see server logs' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

/** Suggest seed companies to find lookalikes of, filtered by type + sub-type. */
discoverRouter.get('/seeds', asyncHandler(async (req, res) => {
  const type = req.query.type ? String(req.query.type).slice(0, 64) : undefined;
  const subType = req.query.subType ? String(req.query.subType).slice(0, 64) : undefined;
  const seeds = await suggestSeeds({ type, subType }, 12);
  res.json({ seeds });
}));

const discoverSchema = z.object({
  seedDomains: z.array(z.string().max(255)).min(1).max(50),
  type: z.string().max(64).optional(),
  subType: z.string().max(64).optional(),
  size: z.number().int().min(1).max(500).optional(),
});

/** Run lookalike discovery with SSE progress. */
discoverRouter.post('/run', rateLimit(10, 60_000), validateBody(discoverSchema), async (req, res) => {
  const { seedDomains, type, subType, size } = req.body as z.infer<typeof discoverSchema>;
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
  try {
    const result = await runDiscoverLookalikes({ seedDomains, type, subType, size }, (m) => send('log', { message: m }));
    send('done', result);
  } catch (err) {
    console.error('[discover/run] error:', (err as Error).stack ?? err);
    send('error', { message: 'Discovery failed — see server logs' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});
