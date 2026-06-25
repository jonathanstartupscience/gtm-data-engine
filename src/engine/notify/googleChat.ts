/**
 * Google Chat notifier — posts reply alerts into a space via an incoming webhook URL.
 * One webhook URL == one space, so channel membership controls who is alerted. Google Chat
 * incoming webhooks accept a simple { text } body. We keep the message plain and scannable, with
 * a deep-link back into our Inbox so the rep can claim + reply with one click (speed-to-lead).
 */
import { request, RateLimiter } from '../../lib/http.js';

// Google's per-space webhook limit is generous; this just smooths bursts.
const limiter = new RateLimiter(60, 60_000);

export interface ReplyAlert {
  replyId: number;          // our bison_replies.id (for the deep-link)
  campaignName?: string | null;
  leadName?: string | null;
  leadEmail?: string | null;
  body?: string | null;
  rep?: string | null;      // round-robin assignee display name
  inboxUrl: string;         // fully-formed https URL to our Inbox, e.g. <publicUrl>/inbox?reply=<id>
  strategy?: string | null; // one-sentence AI response suggestion (from triage)
}

/** Post a reply alert into a Google Chat space. Returns the HTTP response (caller logs failures). */
export async function postReplyAlert(webhookUrl: string, a: ReplyAlert): Promise<Response> {
  return request(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    limiter,
    body: JSON.stringify({ text: buildText(a) }),
  });
}

function buildText(a: ReplyAlert): string {
  const lines: string[] = [];
  lines.push(`🔔 *New reply*${a.campaignName ? ` — ${a.campaignName}` : ''}`);
  if (a.rep) lines.push(`👉 ${a.rep}, you're up`);
  const from = [a.leadName, a.leadEmail].filter(Boolean).join(' · ');
  if (from) lines.push(`From: ${from}`);
  const snippet = (a.body ?? '').replace(/\s+/g, ' ').trim();
  if (snippet) lines.push(`"${snippet.slice(0, 200)}${snippet.length > 200 ? '…' : ''}"`);
  if (a.strategy) lines.push(`💡 *Strategy:* ${a.strategy}`);
  lines.push(`▶ Open & claim: ${a.inboxUrl}`);
  return lines.join('\n');
}

export interface ReferralAlert {
  campaignName?: string | null;
  fromLead?: string | null;   // the original lead who referred us on (departed / OOO)
  referralName?: string | null;
  referralEmail: string;
  referralTitle?: string | null;
  inferredName?: boolean;     // name was guessed from the email, not stated in the reply
  sameDomain?: boolean;       // referral shares the lead's company domain
  leadCreated: boolean;       // true if we auto-created the Bison lead
  createError?: string | null;
  inboxUrl: string;           // deep-link to the reply, where the rep confirms the campaign-add
}

/**
 * Post a "referral captured" card. The lead has ALREADY been auto-created in Bison (or we say why it
 * couldn't be); the human action remaining is confirming the add-to-campaign — deliberately manual so a
 * mis-parsed address never gets cold-emailed on its own.
 */
export async function postReferralAlert(webhookUrl: string, a: ReferralAlert): Promise<Response> {
  return request(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    limiter,
    body: JSON.stringify({ text: buildReferralText(a) }),
  });
}

function buildReferralText(a: ReferralAlert): string {
  const lines: string[] = [];
  lines.push(`🔁 *Referral captured*${a.campaignName ? ` — ${a.campaignName}` : ''}`);
  if (a.fromLead) lines.push(`Original lead (${a.fromLead}) pointed us to someone else:`);
  const who = [a.referralName, a.referralTitle].filter(Boolean).join(', ');
  lines.push(`New contact: ${who ? `${who} · ` : ''}${a.referralEmail}`);
  const flags = [
    a.inferredName ? 'name inferred from email' : null,
    a.sameDomain ? 'same company domain' : 'different domain — sanity-check',
  ].filter(Boolean);
  if (flags.length) lines.push(`(${flags.join('; ')})`);
  lines.push(a.leadCreated
    ? '✅ Lead created in Bison — *not yet added to the campaign.*'
    : `⚠️ Couldn't auto-create the lead${a.createError ? ` (${a.createError})` : ''} — add it manually.`);
  lines.push(`▶ Confirm & add to campaign: ${a.inboxUrl}`);
  return lines.join('\n');
}
