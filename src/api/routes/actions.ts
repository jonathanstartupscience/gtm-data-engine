/**
 * Scoped enrichment/verification actions — run on a SELECTED set of rows from the Companies/
 * Contacts tabs, never the whole DB. This is the credit-safety guard: you choose exactly which
 * records spend vendor credits. Each action shows a cost preview before it runs.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, inArray, isNotNull, ne, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies, contacts } from '../../db/schema.js';
import { runEnrichSelected, runVerifyContacts } from '../../engine/recipes.js';
import { costs } from '../../lib/config.js';
import { asyncHandler } from '../middleware.js';
import { rateLimit, validateBody } from '../validate.js';

export const actionsRouter = Router();

const idsSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(5000) });

/** Cost preview for enriching selected companies (only those with a domain are billable). */
actionsRouter.post('/enrich-companies/scope', rateLimit(30, 60_000), validateBody(idsSchema), asyncHandler(async (req, res) => {
  const { ids } = req.body as z.infer<typeof idsSchema>;
  const rows = await db.select({ id: companies.id }).from(companies)
    .where(and(inArray(companies.id, ids), isNotNull(companies.domain), ne(companies.domain, '')));
  const billable = rows.length;
  res.json({ selected: ids.length, billable, skipped: ids.length - billable, vendor: 'Ocean.io',
    estCostUsd: +(billable * costs.oceanEnrichPerCompany).toFixed(2), unit: 'company' });
}));

/** Cost preview for verifying selected contacts (only those with an email are billable). */
actionsRouter.post('/verify-contacts/scope', rateLimit(30, 60_000), validateBody(idsSchema), asyncHandler(async (req, res) => {
  const { ids } = req.body as z.infer<typeof idsSchema>;
  const rows = await db.select({ email: contacts.email }).from(contacts)
    .where(and(inArray(contacts.id, ids), isNotNull(contacts.email), ne(contacts.email, '')));
  const billable = new Set(rows.map((r) => r.email)).size;
  res.json({ selected: ids.length, billable, skipped: ids.length - billable, vendor: 'Bouncer',
    estCostUsd: +(billable * costs.bouncerPerEmail).toFixed(4), unit: 'email' });
}));

function sse(res: import('express').Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders?.();
}

const runSchema = z.object({ confirm: z.literal(true), ids: z.array(z.number().int().positive()).min(1).max(5000) });

/** Enrich the selected companies via Ocean. SSE. Requires confirm. */
actionsRouter.post('/enrich-companies/run', rateLimit(10, 60_000), validateBody(runSchema), async (req, res) => {
  const { ids } = req.body as z.infer<typeof runSchema>;
  sse(res); let aborted = false; req.on('close', () => { aborted = true; });
  const send = (e: string, d: unknown) => { if (!aborted && !res.writableEnded) res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`); };
  try { const r = await runEnrichSelected(ids, (m) => send('log', { message: m })); send('done', r.stats); }
  catch (e) { console.error('[actions/enrich]', (e as Error).stack ?? e); send('error', { message: 'Enrich failed — see server logs' }); }
  finally { if (!res.writableEnded) res.end(); }
});

/** Verify the selected contacts via Bouncer. SSE. Requires confirm. */
actionsRouter.post('/verify-contacts/run', rateLimit(10, 60_000), validateBody(runSchema), async (req, res) => {
  const { ids } = req.body as z.infer<typeof runSchema>;
  sse(res); let aborted = false; req.on('close', () => { aborted = true; });
  const send = (e: string, d: unknown) => { if (!aborted && !res.writableEnded) res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`); };
  try { const r = await runVerifyContacts(ids, (m) => send('log', { message: m })); send('done', r.stats); }
  catch (e) { console.error('[actions/verify]', (e as Error).stack ?? e); send('error', { message: 'Verify failed — see server logs' }); }
  finally { if (!res.writableEnded) res.end(); }
});

void eq;
