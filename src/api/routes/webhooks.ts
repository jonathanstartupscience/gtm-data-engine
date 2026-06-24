/**
 * Public webhook receiver for Email Bison events (Replied / Interested / Bounced / Unsubscribed…).
 * PUBLIC route (Bison can't carry a Clerk token) — guarded by a secret path token instead:
 *   POST /api/webhooks/bison/:secret    where :secret === BISON_WEBHOOK_SECRET
 * On a reply/interested event we capture it into bison_replies so the Inbox + badge light up.
 */
import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { bisonReplies, bisonCampaigns } from '../../db/schema.js';
import { config } from '../../lib/config.js';
import { asyncHandler } from '../middleware.js';
import { onNewReply } from '../../engine/notify/index.js';

export const webhooksRouter = Router();

const POSITIVE_EVENTS = new Set(['replied', 'reply', 'interested', 'lead_interested', 'positive_reply']);

webhooksRouter.post('/bison/:secret', asyncHandler(async (req, res) => {
  // Constant-time-ish guard: reject unless the path secret matches the configured one.
  if (!config.bisonWebhookSecret || req.params.secret !== config.bisonWebhookSecret) {
    res.status(404).end(); return;
  }
  const e = (req.body ?? {}) as Record<string, unknown>;
  const eventType = String(e.event_type ?? e.type ?? e.event ?? '').toLowerCase();
  const lead = (e.lead ?? {}) as Record<string, unknown>;
  const email = String(lead.email ?? e.email ?? '') || null;
  const interested = eventType.includes('interest') || e.interested === true;
  const isReplyish = POSITIVE_EVENTS.has(eventType) || eventType.includes('repl') || interested;

  // We only persist reply/interested events into the inbox; others (open/bounce) are acked + ignored
  // for now (bounce-feedback into email_status is a later closed-loop step).
  if (isReplyish && email) {
    const campaignId = num(e.campaign_id);
    const [ourCamp] = campaignId
      ? await db.select({ id: bisonCampaigns.id, workspaceId: bisonCampaigns.workspaceId })
          .from(bisonCampaigns).where(eq(bisonCampaigns.bisonCampaignId, campaignId))
      : [undefined];
    const replyId = String(e.id ?? e.reply_id ?? `${email}-${e.created_at ?? ''}`);
    // Field names vary by Bison instance — parse defensively (confirm against a live sample).
    const senderObj = (e.sender_email ?? e.sender ?? {}) as Record<string, unknown>;
    const extReplyId = (e.reply_id ?? e.id) != null ? String(e.reply_id ?? e.id) : null;
    const senderEmailId = num(e.sender_email_id ?? senderObj.id);

    const inserted = await db.insert(bisonReplies).values({
      workspaceId: ourCamp?.workspaceId ?? null,
      campaignId: ourCamp?.id ?? null,
      bisonCampaignId: campaignId ?? null,
      bisonReplyId: replyId,
      bisonReplyExtId: extReplyId,
      senderEmailId,
      leadEmail: email,
      leadName: [lead.first_name, lead.last_name].filter(Boolean).join(' ') || null,
      subject: (e.subject as string) ?? null,
      body: (e.body as string) ?? (e.message as string) ?? null,
      sentiment: interested ? 'interested' : 'positive',
      isPositive: true,
      raw: e,
    }).onConflictDoNothing().returning();

    // Only fire side-effects for a genuinely NEW reply — a dedup no-op (Bison redelivery) returns [].
    // Fire-and-forget so the webhook acks fast; onNewReply isolates its own failures.
    if (inserted.length) void onNewReply(inserted[0]);
  }
  res.json({ ok: true });
}));

function num(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }
