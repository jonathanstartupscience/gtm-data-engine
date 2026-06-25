/** Discovery API: suggest seed companies + run lookalike discovery (SSE). Type/Sub-type aware. */
import { Router } from 'express';
import { z } from 'zod';
import { suggestSeeds } from '../../engine/stages/discover.js';
import { selectCompaniesForContactSearch } from '../../engine/stages/findContacts.js';
import { discoverContactsScope, selectContactsNeedingEmail, type DiscoverPeopleFilters } from '../../engine/stages/discoverContacts.js';
import { runDiscoverLookalikes, runFindContacts, runDiscoverContacts, runFindEmailsForContacts } from '../../engine/recipes.js';
import { costs } from '../../lib/config.js';
import { asyncHandler } from '../middleware.js';
import { rateLimit, validateBody } from '../validate.js';

export const discoverRouter = Router();

/** Scope for Find Contacts: how many companies match the company filters + est. Airscale cost. */
discoverRouter.get('/find-contacts/scope', rateLimit(30, 60_000), asyncHandler(async (req, res) => {
  const q = req.query;
  const persona = q.persona ? String(q.persona).slice(0, 64) : undefined;
  const sel = {
    type: q.type ? String(q.type).slice(0, 64) : undefined,
    subType: q.subType ? String(q.subType).slice(0, 64) : undefined,
    country: q.country ? String(q.country).slice(0, 64) : undefined,
    persona,
    onlyMissingPersona: (q.onlyMissing === '1' || q.onlyMissing === 'true') && !!persona,
  };
  const matched = await selectCompaniesForContactSearch(sel, 100000);
  const perCompany = 2;
  const estPeople = matched.length * perCompany;
  res.json({
    candidates: matched.length,
    unit: sel.onlyMissingPersona ? `companies missing "${persona}"` : 'matching companies',
    estPeople, estCostUsd: estPeople * 0.1 * costs.airscaleEmailPerLookup, // find-people ~0.1cr/lead
    vendor: 'Airscale',
    what: `Sourcing up to ${perCompany} contacts at each of the ${matched.length.toLocaleString()} selected companies, matching your people filters.`,
  });
}));

const findContactsSchema = z.object({
  confirm: z.literal(true),
  persona: z.string().max(64).optional(),
  type: z.string().max(64).optional(),
  subType: z.string().max(64).optional(),
  country: z.string().max(64).optional(),
  onlyMissingPersona: z.boolean().optional(),
  titlesInclude: z.array(z.string().max(120)).max(50).optional(),
  titlesExclude: z.array(z.string().max(120)).max(50).optional(),
  locations: z.array(z.string().max(120)).max(50).optional(),
  keyword: z.string().max(200).optional(),
  limitCompanies: z.number().int().min(1).max(100000).optional(),
  // The cost the UI previewed (from /find-contacts/scope) and showed the user. The server re-checks
  // the live scope against this so a filter that widened between preview and confirm can't quietly
  // spend more than the user agreed to.
  expectedCostUsd: z.number().nonnegative().optional(),
}).refine((b) => b.persona || b.titlesInclude?.length || b.keyword, {
  message: 'Give at least a persona, one job title, or a keyword',
});

/** Recompute the Airscale scope+cost server-side, matching /find-contacts/scope's formula. */
async function findContactsCost(b: z.infer<typeof findContactsSchema>): Promise<number> {
  const matched = await selectCompaniesForContactSearch({
    type: b.type, subType: b.subType, country: b.country, persona: b.persona,
    onlyMissingPersona: !!b.onlyMissingPersona && !!b.persona,
  }, b.limitCompanies ?? 100000);
  return matched.length * 2 * 0.1 * costs.airscaleEmailPerLookup;
}

/** Run Find Contacts (SSE). Requires confirm (spends Airscale). */
discoverRouter.post('/find-contacts', rateLimit(5, 60_000), validateBody(findContactsSchema), async (req, res) => {
  const body = req.body as z.infer<typeof findContactsSchema>;
  // Cost re-check BEFORE opening the SSE stream — a plain 409 the UI can show and re-preview.
  if (body.expectedCostUsd != null) {
    const liveCost = await findContactsCost(body);
    // Allow a 20% drift (data changes between preview and confirm); block a real jump.
    if (liveCost > body.expectedCostUsd * 1.2 + 0.01) {
      return res.status(409).json({
        error: 'cost_changed',
        message: `The selection now costs ~$${liveCost.toFixed(2)}, more than the ~$${body.expectedCostUsd.toFixed(2)} previewed. Re-check the scope and confirm again.`,
        expectedCostUsd: body.expectedCostUsd, liveCostUsd: liveCost,
      });
    }
  }
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

// ─── Discover Contacts: people-FIRST net-new sourcing (Airscale), split discover → find-emails ───

/** Parse the people filters from a request (query or body). */
function peopleFilters(src: Record<string, unknown>): DiscoverPeopleFilters {
  const arr = (v: unknown) => Array.isArray(v) ? v.map((s) => String(s).slice(0, 120)).filter(Boolean)
    : (typeof v === 'string' && v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);
  return {
    titlesInclude: arr(src.titlesInclude), titlesExclude: arr(src.titlesExclude),
    locations: arr(src.locations), keyword: src.keyword ? String(src.keyword).slice(0, 200) : undefined,
    persona: src.persona ? String(src.persona).slice(0, 64) : undefined,
  };
}

/** Scope for Discover Contacts: how many people match + est. Airscale listing cost. */
discoverRouter.get('/discover-contacts/scope', rateLimit(30, 60_000), asyncHandler(async (req, res) => {
  const f = peopleFilters(req.query as Record<string, unknown>);
  const maxLeads = Math.min(Math.max(Number(req.query.maxLeads) || 1000, 1), 5000);
  if (!f.titlesInclude?.length && !f.keyword) { res.status(400).json({ error: 'Give at least one job title or a keyword' }); return; }
  const scope = await discoverContactsScope(f, maxLeads, costs.airscaleFindPersonPerLead);
  res.json({ ...scope, vendor: 'Airscale', unit: 'people',
    what: `Listing up to ${scope.estLeads.toLocaleString()} of ${scope.total.toLocaleString()} matching people. Emails are found separately.` });
}));

const discoverContactsSchema = z.object({
  confirm: z.literal(true),
  titlesInclude: z.array(z.string().max(120)).max(50).optional(),
  titlesExclude: z.array(z.string().max(120)).max(50).optional(),
  locations: z.array(z.string().max(120)).max(50).optional(),
  keyword: z.string().max(200).optional(),
  persona: z.string().max(64).optional(),
  maxLeads: z.number().int().min(1).max(5000).optional(),
  expectedCostUsd: z.number().nonnegative().optional(),
}).refine((b) => b.titlesInclude?.length || b.keyword, { message: 'Give at least one job title or a keyword' });

/** Run Discover Contacts (SSE). Requires confirm (spends Airscale listing credits). */
discoverRouter.post('/discover-contacts', rateLimit(5, 60_000), validateBody(discoverContactsSchema), async (req, res) => {
  const body = req.body as z.infer<typeof discoverContactsSchema>;
  const maxLeads = body.maxLeads ?? 1000;
  if (body.expectedCostUsd != null) {
    const scope = await discoverContactsScope(body, maxLeads, costs.airscaleFindPersonPerLead);
    if (scope.estCostUsd > body.expectedCostUsd * 1.2 + 0.01) {
      return res.status(409).json({ error: 'cost_changed',
        message: `The search now costs ~$${scope.estCostUsd.toFixed(2)}, more than the ~$${body.expectedCostUsd.toFixed(2)} previewed. Re-check the scope and confirm again.`,
        expectedCostUsd: body.expectedCostUsd, liveCostUsd: scope.estCostUsd });
    }
  }
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
    const result = await runDiscoverContacts({ ...body, maxLeads }, (m) => send('log', { message: m }));
    send('done', result);
  } catch (err) {
    console.error('[discover-contacts] error:', (err as Error).stack ?? err);
    send('error', { message: 'Discover contacts failed — see server logs' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

const idsBodySchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(5000) });

/** Cost preview for finding emails on selected contacts (only those lacking an email are billable). */
discoverRouter.post('/discover-contacts/find-emails/scope', rateLimit(30, 60_000), validateBody(idsBodySchema), asyncHandler(async (req, res) => {
  const { ids } = req.body as z.infer<typeof idsBodySchema>;
  const need = await selectContactsNeedingEmail(ids);
  const billable = need.filter((r) => (r.domain ?? '').trim()).length;
  res.json({ selected: ids.length, billable, skipped: ids.length - billable, vendor: 'Airscale', unit: 'email',
    estCostUsd: +(billable * costs.airscaleEmailPerLookup).toFixed(4) });
}));

const findEmailsRunSchema = z.object({ confirm: z.literal(true), ids: z.array(z.number().int().positive()).min(1).max(5000), expectedCostUsd: z.number().nonnegative().optional() });

/** Run email-finding (SSE) for selected contacts. Requires confirm (spends Airscale email credits). */
discoverRouter.post('/discover-contacts/find-emails', rateLimit(5, 60_000), validateBody(findEmailsRunSchema), async (req, res) => {
  const body = req.body as z.infer<typeof findEmailsRunSchema>;
  if (body.expectedCostUsd != null) {
    const need = await selectContactsNeedingEmail(body.ids);
    const liveCost = need.filter((r) => (r.domain ?? '').trim()).length * costs.airscaleEmailPerLookup;
    if (liveCost > body.expectedCostUsd * 1.2 + 0.01) {
      return res.status(409).json({ error: 'cost_changed',
        message: `Finding emails now costs ~$${liveCost.toFixed(2)}, more than the ~$${body.expectedCostUsd.toFixed(2)} previewed. Re-check and confirm again.`,
        expectedCostUsd: body.expectedCostUsd, liveCostUsd: liveCost });
    }
  }
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
    const result = await runFindEmailsForContacts(body.ids, (m) => send('log', { message: m }));
    send('done', result);
  } catch (err) {
    console.error('[find-emails] error:', (err as Error).stack ?? err);
    send('error', { message: 'Find emails failed — see server logs' });
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
