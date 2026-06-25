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
import { postReplyAlert, postReferralAlert } from './googleChat.js';
import { syncReplyToHubspot } from './hubspotSync.js';
import { triageReply, type TriageVerdict } from './triage.js';
import { captureReferral } from './referral.js';

type ReplyRow = typeof bisonReplies.$inferSelect;

// HubSpot sync is held back until the CRM objects are fixed. Default off; enable with REPLY_HUBSPOT_SYNC=1.
const HUBSPOT_SYNC_ENABLED = /^(1|true|yes|on)$/i.test(process.env.REPLY_HUBSPOT_SYNC ?? '');

/**
 * Run all reply side-effects. Triage runs FIRST (and synchronously) because its verdict gates the rest:
 * a non-actionable auto-reply is suppressed from the leads channel, and an extracted referral spawns the
 * capture leg. The HubSpot sync stays independent. Each effect is isolated — a throw is logged, never
 * propagated to the webhook ack. If triage is unavailable (no key / parse failure) we fall back to the
 * legacy behavior: notify unconditionally, no strategy line.
 */
export async function onNewReply(reply: ReplyRow): Promise<void> {
  const verdict = await triageReply({
    leadEmail: reply.leadEmail, leadName: reply.leadName, subject: reply.subject, body: reply.body,
  }).catch((e) => { console.error('[reply] triage failed', e); return null; });

  // Persist the verdict for the Inbox + audit (idempotent; redelivery just re-writes the same values).
  if (verdict) {
    await db.update(bisonReplies).set({
      triageCategory: verdict.category,
      triageActionable: verdict.actionable,
      triageStrategy: verdict.strategy,
      referral: verdict.referral,
    }).where(eq(bisonReplies.id, reply.id));
  }

  const effects = [
    notifyReply(reply, verdict).catch((e) => { console.error('[reply] notify failed', e); }),
  ];
  // Referral leg: auto-create the lead, post a confirm card. Independent of the main notify.
  if (verdict?.referral) {
    effects.push(handleReferral(reply, verdict).catch((e) => { console.error('[reply] referral failed', e); }));
  }
  if (HUBSPOT_SYNC_ENABLED) {
    effects.push(syncReplyToHubspot(reply).catch((e) => { console.error('[reply] hubspot sync failed', e); }));
  }
  await Promise.allSettled(effects);
}

/**
 * Auto-create the referred contact as a Bison lead (campaign-add stays manual) and post the confirm
 * card. The card posts to the same space the reply would have notified, so reps see it in context.
 */
async function handleReferral(reply: ReplyRow, verdict: TriageVerdict): Promise<void> {
  const referral = verdict.referral!;
  const { rep: _rep, webhookUrl } = await pickRep({ workspaceId: reply.workspaceId, campaignId: reply.campaignId });

  const result = await captureReferral(reply, referral);

  if (!webhookUrl) {
    console.warn('[reply] no Google Chat webhook configured; referral captured but not announced', reply.id);
    return;
  }
  const inboxUrl = `${config.publicUrl.replace(/\/$/, '')}/inbox?reply=${reply.id}`;
  const resp = await postReferralAlert(webhookUrl, {
    campaignName: await campaignNameFor(reply.campaignId),
    fromLead: reply.leadEmail,
    referralName: referral.name, referralEmail: referral.email, referralTitle: referral.title,
    inferredName: referral.inferredName, sameDomain: referral.sameDomain,
    leadCreated: !!result.leadId, createError: result.error ?? null,
    inboxUrl,
  });
  if (!resp.ok) throw new Error(`Google Chat referral post failed (${resp.status})`);
}

async function campaignNameFor(campaignId: number | null): Promise<string | null> {
  if (!campaignId) return null;
  const [c] = await db.select({ name: bisonCampaigns.name }).from(bisonCampaigns).where(eq(bisonCampaigns.id, campaignId));
  return c?.name ?? null;
}

/**
 * Round-robin a rep, record the assignment, and post the Google Chat alert. When triage marks the reply
 * non-actionable (a bare OOO, an unsubscribe, a bounce) we SUPPRESS the channel post entirely — the
 * reply still lands in the in-app Inbox, it just doesn't put a rep on the clock. A null verdict (triage
 * unavailable) falls through to the legacy behavior: always notify.
 */
export async function notifyReply(reply: ReplyRow, verdict?: TriageVerdict | null): Promise<void> {
  if (verdict && !verdict.actionable) {
    console.log(`[reply] suppressed non-actionable reply ${reply.id} (${verdict.category}) from leads channel`);
    return;
  }
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
    body: reply.body, rep, inboxUrl, strategy: verdict?.strategy ?? null,
  });
  if (!resp.ok) throw new Error(`Google Chat post failed (${resp.status})`);
}
