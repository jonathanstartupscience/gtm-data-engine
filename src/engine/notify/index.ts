/**
 * Reply side-effects orchestrator. Called once per genuinely-new reply (gated on a real DB insert,
 * never on a webhook redelivery). Fires independent, fully-guarded effects:
 *   1. notifyReply       — round-robin a rep and post a Google Chat alert linking back to the Inbox
 *   2. syncReplyToHubspot — promote the contact to MQL / lead status REPLIED  [GATED — see below]
 * Each is isolated so one failing never blocks the other or the webhook's fast { ok: true } ack.
 *
 * The HubSpot leg is OFF until the HubSpot contact objects/properties are sorted out. The code is
 * intact; flip it on by setting REPLY_HUBSPOT_SYNC=1 (env, no code change). Until then replies still
 * notify reps and the in-app handoff works — only the CRM write is held back.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { bisonReplies, bisonCampaigns } from '../../db/schema.js';
import { config } from '../../lib/config.js';
import { pickRep } from './route.js';
import { postReplyAlert } from './googleChat.js';
import { syncReplyToHubspot } from './hubspotSync.js';

type ReplyRow = typeof bisonReplies.$inferSelect;

// HubSpot sync is held back until the CRM objects are fixed. Default off; enable with REPLY_HUBSPOT_SYNC=1.
const HUBSPOT_SYNC_ENABLED = /^(1|true|yes|on)$/i.test(process.env.REPLY_HUBSPOT_SYNC ?? '');

/** Run all reply side-effects. Effects are isolated; a throw in one is logged, not propagated. */
export async function onNewReply(reply: ReplyRow): Promise<void> {
  const effects = [
    notifyReply(reply).catch((e) => { console.error('[reply] notify failed', e); }),
  ];
  if (HUBSPOT_SYNC_ENABLED) {
    effects.push(syncReplyToHubspot(reply).catch((e) => { console.error('[reply] hubspot sync failed', e); }));
  }
  await Promise.allSettled(effects);
}

/** Round-robin a rep, record the assignment, and post the Google Chat alert. */
export async function notifyReply(reply: ReplyRow): Promise<void> {
  const { rep, webhookUrl } = await pickRep({ workspaceId: reply.workspaceId, campaignId: reply.campaignId });

  // Record who was assigned even if we can't post (so the Inbox shows the round-robin pick).
  if (rep && rep !== reply.assignedRep) {
    await db.update(bisonReplies).set({ assignedRep: rep }).where(eq(bisonReplies.id, reply.id));
  }

  if (!webhookUrl) {
    console.warn('[reply] no Google Chat webhook configured; skipping alert for reply', reply.id);
    return;
  }

  let campaignName: string | null = null;
  if (reply.campaignId) {
    const [c] = await db.select({ name: bisonCampaigns.name }).from(bisonCampaigns).where(eq(bisonCampaigns.id, reply.campaignId));
    campaignName = c?.name ?? null;
  }

  const inboxUrl = `${config.publicUrl.replace(/\/$/, '')}/inbox?reply=${reply.id}`;
  const resp = await postReplyAlert(webhookUrl, {
    replyId: reply.id, campaignName, leadName: reply.leadName, leadEmail: reply.leadEmail,
    body: reply.body, rep, inboxUrl,
  });
  if (!resp.ok) throw new Error(`Google Chat post failed (${resp.status})`);
}
