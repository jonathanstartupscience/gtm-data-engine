/**
 * LinkedIn Engine API (HeyReach). Sync + push + monitor (HeyReach has no API campaign-create):
 * mirror campaigns, push a LinkedIn segment (contacts WITH a profile URL) into an ACTIVE campaign,
 * pull stats + inbox conversations. Degrades gracefully when no API key is configured.
 */
import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, sql, isNotNull, ne } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { heyreachCampaigns, heyreachReplies, heyreachPushLog, contacts, contactCompany, companies } from '../../db/schema.js';
import {
  isConfigured, checkApiKey, listCampaigns, pauseCampaign, resumeCampaign,
  addLeadsToCampaign, getOverallStats, getConversations, type HrLead,
} from '../../engine/adapters/heyreach.js';
import { asyncHandler } from '../middleware.js';
import { rateLimit, validateBody } from '../validate.js';

export const linkedinRouter = Router();
const err = (res: import('express').Response, status: number, msg: string) => res.status(status).json({ error: msg });
const notConfigured = (res: import('express').Response) =>
  res.status(200).json({ configured: false, message: 'HeyReach API key not set. Add HEYREACH_API_KEY in Railway to enable LinkedIn outreach.' });

/** Connection status — drives the "not configured" UI state. */
linkedinRouter.get('/status', asyncHandler(async (_req, res) => {
  if (!isConfigured()) { res.json({ configured: false }); return; }
  const check = await checkApiKey();
  res.json({ configured: true, keyValid: check.ok, status: check.status });
}));

/** A LinkedIn-pushable segment: contacts WITH a LinkedIn profile URL (email not required). */
async function linkedinSegment(persona?: string, subType?: string, limit = 100000) {
  const conds = [
    isNotNull(contacts.linkedinUrl), ne(contacts.linkedinUrl, ''),
    persona ? eq(contacts.persona, persona) : undefined,
  ].filter(Boolean);
  let rows = await db.select({
    firstName: contacts.firstName, lastName: contacts.lastName, linkedinUrl: contacts.linkedinUrl,
    email: contacts.email, jobTitle: contacts.jobTitle, persona: contacts.persona,
    companyName: companies.name, subType: companies.subType,
  }).from(contacts)
    .leftJoin(contactCompany, eq(contactCompany.contactId, contacts.id))
    .leftJoin(companies, eq(companies.id, contactCompany.companyId))
    .where(and(...conds)).limit(limit);
  if (subType) rows = rows.filter((r) => r.subType === subType);
  const seen = new Set<string>();
  return rows.filter((r) => r.linkedinUrl && !seen.has(r.linkedinUrl) && seen.add(r.linkedinUrl));
}

linkedinRouter.get('/segment-count', asyncHandler(async (req, res) => {
  const persona = req.query.persona ? String(req.query.persona).slice(0, 64) : undefined;
  const subType = req.query.subType ? String(req.query.subType).slice(0, 64) : undefined;
  res.json({ count: (await linkedinSegment(persona, subType)).length });
}));

/** Stored campaign mirror. */
linkedinRouter.get('/campaigns', asyncHandler(async (_req, res) => {
  res.json({ configured: isConfigured(), campaigns: await db.select().from(heyreachCampaigns).orderBy(desc(heyreachCampaigns.id)) });
}));

/** Sync campaigns + overall stats from HeyReach into our mirror. */
linkedinRouter.post('/sync', rateLimit(10, 60_000), asyncHandler(async (_req, res) => {
  if (!isConfigured()) return notConfigured(res);
  const live = await listCampaigns();
  let added = 0, updated = 0;
  for (const lc of live) {
    const [existing] = await db.select().from(heyreachCampaigns).where(eq(heyreachCampaigns.heyreachCampaignId, lc.id));
    if (existing) {
      await db.update(heyreachCampaigns).set({ name: lc.name, status: lc.status ?? existing.status, syncedAt: new Date() }).where(eq(heyreachCampaigns.id, existing.id));
      updated++;
    } else {
      await db.insert(heyreachCampaigns).values({ heyreachCampaignId: lc.id, name: lc.name, status: lc.status }).onConflictDoNothing();
      added++;
    }
  }
  res.json({ synced: live.length, added, updated });
}));

linkedinRouter.post('/campaigns/:id/pause', rateLimit(10, 60_000), asyncHandler(async (req, res) => {
  if (!isConfigured()) return notConfigured(res);
  const [c] = await db.select().from(heyreachCampaigns).where(eq(heyreachCampaigns.id, Number(req.params.id)));
  if (!c) return err(res, 404, 'not found');
  const r = await pauseCampaign(c.heyreachCampaignId);
  if (!r.ok) return err(res, 502, `HeyReach pause failed (${r.status})`);
  await db.update(heyreachCampaigns).set({ status: 'PAUSED' }).where(eq(heyreachCampaigns.id, c.id));
  res.json({ ok: true });
}));

linkedinRouter.post('/campaigns/:id/resume', rateLimit(10, 60_000), asyncHandler(async (req, res) => {
  if (!isConfigured()) return notConfigured(res);
  const [c] = await db.select().from(heyreachCampaigns).where(eq(heyreachCampaigns.id, Number(req.params.id)));
  if (!c) return err(res, 404, 'not found');
  const r = await resumeCampaign(c.heyreachCampaignId);
  if (!r.ok) return err(res, 502, `HeyReach resume failed (${r.status})`);
  await db.update(heyreachCampaigns).set({ status: 'IN_PROGRESS' }).where(eq(heyreachCampaigns.id, c.id));
  res.json({ ok: true });
}));

/** Push a LinkedIn segment into an ACTIVE HeyReach campaign. SSE. */
const pushSchema = z.object({ confirm: z.literal(true), persona: z.string().max(64).optional(), subType: z.string().max(64).optional() });
linkedinRouter.post('/campaigns/:id/push', rateLimit(5, 60_000), validateBody(pushSchema), async (req, res) => {
  if (!isConfigured()) { notConfigured(res); return; }
  const [c] = await db.select().from(heyreachCampaigns).where(eq(heyreachCampaigns.id, Number(req.params.id)));
  if (!c) { err(res, 404, 'not found'); return; }
  const { persona, subType } = req.body as z.infer<typeof pushSchema>;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders?.();
  let aborted = false; req.on('close', () => { aborted = true; });
  const send = (e: string, d: unknown) => { if (!aborted && !res.writableEnded) res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`); };
  try {
    const rows = await linkedinSegment(persona ?? c.persona ?? undefined, subType ?? c.subType ?? undefined);
    send('log', { message: `Pushing ${rows.length} LinkedIn contacts to HeyReach campaign…` });
    const leads: HrLead[] = rows.map((r) => ({
      firstName: r.firstName ?? undefined, lastName: r.lastName ?? undefined,
      profileUrl: r.linkedinUrl!, emailAddress: r.email ?? undefined,
      companyName: r.companyName ?? undefined, position: r.jobTitle ?? undefined,
      customUserFields: [
        ...(r.persona ? [{ name: 'persona', value: r.persona }] : []),
        ...(r.subType ? [{ name: 'sub_type', value: r.subType }] : []),
      ],
    }));
    const result = await addLeadsToCampaign(c.heyreachCampaignId, leads);
    await db.insert(heyreachPushLog).values({
      campaignId: c.id, leadsAdded: result.added, leadsUpdated: result.updated, leadsFailed: result.failed,
      segmentFilterJson: { persona: persona ?? c.persona, subType: subType ?? c.subType },
    });
    send('done', { segment: leads.length, ...result });
  } catch (e) {
    console.error('[linkedin/push]', (e as Error).stack ?? e);
    send('error', { message: 'Push failed — see server logs' });
  } finally { if (!res.writableEnded) res.end(); }
});

/** Refresh overall stats (stored on each campaign best-effort). */
linkedinRouter.post('/refresh-stats', rateLimit(20, 60_000), asyncHandler(async (_req, res) => {
  if (!isConfigured()) return notConfigured(res);
  const stats = await getOverallStats();
  res.json({ stats });
}));

// ----------------------------------------------------------------- inbox
linkedinRouter.get('/inbox/unread-count', asyncHandler(async (_req, res) => {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(heyreachReplies)
    .where(and(eq(heyreachReplies.status, 'new'), eq(heyreachReplies.isPositive, true)));
  res.json({ count: Number(n) });
}));

linkedinRouter.get('/inbox', asyncHandler(async (req, res) => {
  const positiveOnly = req.query.positive === '1';
  const rows = await db.select().from(heyreachReplies)
    .where(positiveOnly ? eq(heyreachReplies.isPositive, true) : undefined)
    .orderBy(desc(heyreachReplies.isPositive), desc(heyreachReplies.receivedAt)).limit(200);
  res.json({ configured: isConfigured(), replies: rows });
}));

/** Pull conversations from HeyReach into our inbox (dedup by conversationId). */
linkedinRouter.post('/inbox/sync', rateLimit(20, 60_000), asyncHandler(async (_req, res) => {
  if (!isConfigured()) return notConfigured(res);
  const convos = await getConversations({});
  let added = 0;
  for (const cv of convos) {
    const convId = String(cv.id ?? `${cv.correspondentProfile?.profileUrl ?? ''}-${cv.lastMessage?.createdAt ?? ''}`);
    const [existing] = await db.select({ id: heyreachReplies.id }).from(heyreachReplies).where(eq(heyreachReplies.conversationId, convId));
    if (existing) continue;
    const p = cv.correspondentProfile ?? {};
    // A conversation with a lead-originated last message is a reply worth surfacing.
    const positive = cv.lastMessage?.sender ? !/me|sender|self/i.test(String(cv.lastMessage.sender)) : true;
    await db.insert(heyreachReplies).values({
      heyreachCampaignId: cv.campaignId ?? null, conversationId: convId,
      leadName: [p.firstName, p.lastName].filter(Boolean).join(' ') || null,
      profileUrl: p.profileUrl ?? null, company: p.companyName ?? null,
      lastMessage: cv.lastMessage?.body ?? cv.lastMessage?.text ?? null,
      isPositive: positive, raw: cv,
    }).onConflictDoNothing();
    added++;
  }
  res.json({ pulled: convos.length, added });
}));

const replyActionSchema = z.object({ status: z.enum(['new', 'read', 'handled']).optional() });
linkedinRouter.post('/inbox/:id/action', rateLimit(60, 60_000), validateBody(replyActionSchema), asyncHandler(async (req, res) => {
  const b = req.body as z.infer<typeof replyActionSchema>;
  if (b.status) await db.update(heyreachReplies).set({ status: b.status }).where(eq(heyreachReplies.id, Number(req.params.id)));
  res.json({ ok: true });
}));
