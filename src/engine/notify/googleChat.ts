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
  lines.push(`▶ Open & claim: ${a.inboxUrl}`);
  return lines.join('\n');
}
