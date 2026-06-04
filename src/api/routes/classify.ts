/** Classify review API: list proposals, audit counts, approve/reject (apply to store on approve). */
import { Router } from 'express';
import { z } from 'zod';
import { and, count, desc, eq, gte, isNull, lt, or, ne, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies, classifyProposals, hubspotSync } from '../../db/schema.js';
import { typeValue } from '../../engine/taxonomy.js';
import { patchCompany } from '../../engine/adapters/hubspot.js';
import { classifyCompanies } from '../../engine/stages/classify.js';
import { anthropicClassify, isConfiguredAsync as anthropicConfigured } from '../../engine/adapters/anthropic.js';
import { config } from '../../lib/config.js';
import { asyncHandler } from '../middleware.js';
import { rateLimit, validateBody } from '../validate.js';

export const classifyRouter = Router();

/** Audit: how many companies are missing taxonomy + how many pending proposals exist. */
classifyRouter.get('/audit', asyncHandler(async (_req, res) => {
  const [[missing], [pending]] = await Promise.all([
    db.select({ n: count() }).from(companies).where(and(
      or(isNull(companies.type), eq(companies.type, ''), isNull(companies.subType), eq(companies.subType, '')))),
    db.select({ n: count() }).from(classifyProposals).where(eq(classifyProposals.status, 'pending')),
  ]);
  res.json({ missingTaxonomy: missing.n, pendingProposals: pending.n, canRunInApp: await anthropicConfigured() });
}));

/** Run the AI classifier in-app (needs ANTHROPIC_API_KEY). SSE progress. Writes to the review queue. */
classifyRouter.get('/run', rateLimit(5, 60_000), async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
  const oceanFallback = req.query.ocean === '1';
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders?.();
  let aborted = false; req.on('close', () => { aborted = true; });
  const send = (e: string, d: unknown) => { if (!aborted && !res.writableEnded) res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`); };
  try {
    if (!(await anthropicConfigured())) { send('error', { message: 'No Anthropic API key. Add ANTHROPIC_API_KEY in Settings to run the classifier in-app.' }); return; }
    send('log', { message: `Classifying up to ${limit} companies${oceanFallback ? ' (homepage + Ocean fallback)' : ' (homepage signal)'}…` });
    const r = await classifyCompanies(anthropicClassify, { limit, oceanFallback }, (m) => send('log', { message: m }));
    send('done', r);
  } catch (e) {
    console.error('[classify/run]', (e as Error).stack ?? e);
    send('error', { message: 'Classifier run failed — see server logs' });
  } finally { if (!res.writableEnded) res.end(); }
});

/** Pending proposals, with company context. Optional ?minConfidence= filter. */
classifyRouter.get('/proposals', asyncHandler(async (req, res) => {
  const minC = Number(req.query.minConfidence) || 0;
  const rows = await db
    .select({
      id: classifyProposals.id, companyId: classifyProposals.companyId,
      type: classifyProposals.proposedType, subType: classifyProposals.proposedSubType,
      confidence: classifyProposals.confidence, reason: classifyProposals.reason, signal: classifyProposals.signal,
      name: companies.name, domain: companies.domain,
      currentType: companies.type, currentSubType: companies.subType,
    })
    .from(classifyProposals)
    .innerJoin(companies, eq(companies.id, classifyProposals.companyId))
    .where(and(eq(classifyProposals.status, 'pending'), gte(classifyProposals.confidence, minC)))
    .orderBy(desc(classifyProposals.confidence))
    .limit(500);
  res.json({ proposals: rows });
}));

const decideSchema = z.object({
  approve: z.array(z.number().int()).max(1000).optional(),
  reject: z.array(z.number().int()).max(1000).optional(),
});

/** Apply decisions: approved proposals write type/sub_type to the company; rejected are dismissed. */
classifyRouter.post('/decide', validateBody(decideSchema), asyncHandler(async (req, res) => {
  const { approve = [], reject = [] } = req.body as z.infer<typeof decideSchema>;
  let applied = 0, hubspotSynced = 0, hubspotFailed = 0;
  const canPushHubspot = !!config.hubspotToken;
  for (const id of approve) {
    const [p] = await db.select().from(classifyProposals).where(eq(classifyProposals.id, id));
    if (!p || p.status !== 'pending') continue;
    // Map the human type LABEL back to the stored internal value (e.g. ESO → CUSTOMER).
    const internalType = p.proposedType ? typeValue(p.proposedType) : null;
    const patch: Record<string, string> = {};
    if (internalType) patch.type = internalType;
    if (p.proposedSubType) patch.subType = p.proposedSubType;
    if (Object.keys(patch).length) {
      await db.update(companies).set({ ...patch, updatedAt: new Date() }).where(eq(companies.id, p.companyId));
      // Hygiene point: also write the classification back to HubSpot (the system of record).
      const [co] = await db.select({ hubspotId: companies.hubspotId }).from(companies).where(eq(companies.id, p.companyId));
      if (canPushHubspot && co?.hubspotId) {
        try {
          const hsProps: Record<string, string> = {};
          if (patch.type) hsProps.type = patch.type;
          if (patch.subType) hsProps.sub_type = patch.subType;
          await patchCompany(co.hubspotId, hsProps);
          await db.insert(hubspotSync).values({ entityType: 'company', entityId: p.companyId, hubspotId: co.hubspotId, action: 'patch', overwrote: JSON.stringify(hsProps) });
          hubspotSynced++;
        } catch { hubspotFailed++; }
      }
    }
    await db.update(classifyProposals).set({ status: 'applied', reviewedAt: new Date() }).where(eq(classifyProposals.id, id));
    applied++;
  }
  if (reject.length) {
    await db.update(classifyProposals).set({ status: 'rejected', reviewedAt: new Date() })
      .where(and(eq(classifyProposals.status, 'pending'), sql`${classifyProposals.id} = any(${reject})`));
  }
  res.json({ applied, rejected: reject.length, hubspotSynced, hubspotFailed, hubspotConfigured: canPushHubspot });
  void lt; void ne;
}));
