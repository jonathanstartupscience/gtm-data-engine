/**
 * Reply triage — the per-reply AI agent. One Opus call reads the reply body and returns a structured
 * verdict that drives the rest of the pipeline:
 *   - category + actionable  → whether to notify reps at all (auto-replies are suppressed from the channel)
 *   - strategy               → a one-sentence response suggestion (only for genuine human replies)
 *   - referral               → a colleague/replacement email pulled out of an OOO or "I've left" reply
 *
 * Why an LLM and not regex for the referral email: real bodies carry MANY addresses (the sender's own,
 * a mailto in the signature, social links, legal footers). The address we must contact is the one the
 * TEXT points us to — distinguishing it from the sender's own address and signature noise is a reading
 * task, not a pattern match. Calibrated against two live samples:
 *   1. "I am no longer working at Impact Hub. Please email alex.milner@impacthub.net" — the referral is
 *      in the BODY; the signature still names the person who LEFT (must not be picked).
 *   2. "reach out to mu Area Director, Jason Housey, at jason.housey@iwgplc.com" — typo'd trigger word,
 *      and the referral is on a DIFFERENT domain than the lead (Regus → IWG). Same-domain is a signal,
 *      never a requirement.
 *
 * The agent never sends anything. Its output is persisted on bison_replies and acted on by the notify
 * orchestrator. Referral leads are auto-CREATED but the add-to-campaign step stays manual (no surprise
 * cold-emails from a mis-parsed address).
 */
import { anthropicComplete, extractJson, isConfiguredAsync, MODEL_OPUS } from '../adapters/anthropic.js';

export type TriageCategory =
  | 'auto_ooo'       // out-of-office with no colleague to contact
  | 'left_company'   // person has left; may or may not name a replacement
  | 'unsubscribe'    // opt-out / remove request
  | 'bounce'         // delivery failure / mailer-daemon
  | 'interested'     // positive, wants to engage
  | 'objection'      // pushback (timing, budget, not a fit)
  | 'question'       // asking for info before engaging
  | 'referral'       // a human reply that forwards us to someone else
  | 'other';

export interface ReferralContact {
  name: string | null;     // display name if the body/signature gives one for the REFERRAL (not the sender)
  email: string;           // the address we were told to contact (validated, lowercased)
  title: string | null;    // role if stated ("Area Director"), else null
  inferredName: boolean;   // true when `name` was derived from the email local-part, not stated in the text
  sameDomain: boolean;     // referral email shares the lead's domain (a legitimacy signal, not a gate)
}

export interface TriageVerdict {
  category: TriageCategory;
  actionable: boolean;          // false → auto/no-action; suppressed from the leads channel
  strategy: string | null;      // one sentence; null for non-actionable
  referral: ReferralContact | null;
}

const SYSTEM = `You triage replies to cold outbound emails for a B2B sales team. You read ONE reply and \
return a strict JSON verdict. You never write a reply or take an action — you only classify and extract.`;

/** Title-case an email local-part into a plausible display name: "alex.milner" → "Alex Milner". */
export function nameFromEmail(email: string): string | null {
  const local = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
  if (!local) return null;
  const parts = local.split(/\s+/).filter((p) => /[a-z]/i.test(p)); // drop pure-numeric fragments (e.g. "john.123")
  if (!parts.length) return null;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildPrompt(input: { leadEmail: string | null; leadName: string | null; subject: string | null; body: string | null }): string {
  return `A lead replied to our cold email. Triage it.

LEAD (the person we originally emailed): ${input.leadName ?? '(unknown)'} <${input.leadEmail ?? '(unknown)'}>
SUBJECT: ${input.subject ?? '(none)'}
REPLY BODY:
"""
${(input.body ?? '').slice(0, 6000)}
"""

Return ONLY a JSON object, no prose, with this exact shape:
{
  "category": one of ["auto_ooo","left_company","unsubscribe","bounce","interested","objection","question","referral","other"],
  "actionable": boolean,
  "strategy": string | null,
  "referral": { "name": string | null, "email": string, "title": string | null } | null
}

Rules:
- "actionable" is true ONLY for a genuine action a rep should take now: interested, objection, question,
  referral, or a left_company/auto_ooo reply THAT NAMES SOMEONE ELSE TO CONTACT. A bare out-of-office,
  an unsubscribe, or a bounce is NOT actionable (actionable=false, strategy=null, referral=null).
- "strategy": one concise sentence telling the rep how to respond. Only when actionable. Otherwise null.
- "referral": when the body tells us to contact a DIFFERENT person (a colleague, a replacement, "I've
  left, email X", "reach out to my Area Director Y at Z"), extract THAT person's email.
    * Pick the address the TEXT directs us to — NOT the sender's own address, NOT a mailto/social/legal
      link in the signature. The signature often still shows the departed person; never use that.
    * Use the referral person's name/title ONLY if the body states it for that person. If only an email
      is given, set name and title to null (we will infer a display name ourselves).
    * The referral email may be on a different domain than the lead — that is fine, still extract it.
    * If no specific person/email is offered, referral must be null.
- If the body is empty or unreadable, category "other", actionable false, everything null.`;
}

/**
 * Run triage on one reply. Returns null if the LLM is unavailable or the response is unparseable — the
 * caller treats null as "no triage" and falls back to the legacy notify behavior (post, unassigned),
 * so a triage outage degrades to the old path rather than dropping replies.
 */
export async function triageReply(input: {
  leadEmail: string | null;
  leadName: string | null;
  subject: string | null;
  body: string | null;
}): Promise<TriageVerdict | null> {
  if (!(await isConfiguredAsync())) return null;

  let text: string;
  try {
    text = await anthropicComplete({ prompt: buildPrompt(input), system: SYSTEM, model: MODEL_OPUS, maxTokens: 700 });
  } catch (e) {
    console.error('[triage] LLM call failed', e);
    return null;
  }

  const raw = extractJson<{
    category?: string;
    actionable?: boolean;
    strategy?: string | null;
    referral?: { name?: string | null; email?: string; title?: string | null } | null;
  }>(text);
  if (!raw) { console.warn('[triage] could not parse verdict from model output'); return null; }

  const category = (raw.category ?? 'other') as TriageCategory;
  const actionable = raw.actionable === true;
  const strategy = actionable && typeof raw.strategy === 'string' && raw.strategy.trim()
    ? raw.strategy.trim()
    : null;

  // Validate the extracted referral email server-side — never trust the model to have returned a real,
  // distinct address. Reject anything malformed or identical to the lead's own address (that would just
  // re-add the person who already replied).
  let referral: ReferralContact | null = null;
  const refEmail = raw.referral?.email?.toLowerCase().trim();
  if (refEmail && EMAIL_RE.test(refEmail) && refEmail !== (input.leadEmail ?? '').toLowerCase().trim()) {
    const statedName = raw.referral?.name?.trim() || null;
    const name = statedName ?? nameFromEmail(refEmail);
    const leadDomain = (input.leadEmail ?? '').split('@')[1]?.toLowerCase() ?? '';
    referral = {
      name,
      email: refEmail,
      title: raw.referral?.title?.trim() || null,
      inferredName: !statedName && !!name,
      sameDomain: !!leadDomain && refEmail.split('@')[1] === leadDomain,
    };
  }

  return { category, actionable, strategy, referral };
}
