/**
 * Referral capture — when triage pulls a "contact this person instead" email out of a reply, we
 * AUTO-CREATE that person as a lead in the reply's workspace (so the rep doesn't retype it) but we do
 * NOT add them to the campaign here. The add-to-campaign step is a deliberate human confirm in the
 * leads channel / Inbox — a mis-parsed address must never get cold-emailed automatically.
 *
 * Idempotent on the reply: if a referral lead was already created for this reply (referralLeadId set),
 * we don't create a second one on a redelivery.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { bisonReplies } from '../../db/schema.js';
import { bisonClientFor, type BisonLead } from '../adapters/emailbison.js';
import type { ReferralContact } from './triage.js';

type ReplyRow = typeof bisonReplies.$inferSelect;

export interface ReferralResult {
  leadId: number | null;
  error?: string;
}

/**
 * Create the referral as a lead in the reply's Bison workspace. Returns the new lead id (null if the
 * workspace has no Bison key, or the create failed — the caller still posts the confirm card with the
 * parsed details so a human can act). Persists referralLeadId + referralStatus='pending_confirm'.
 */
export async function captureReferral(reply: ReplyRow, referral: ReferralContact): Promise<ReferralResult> {
  if (reply.referralLeadId) return { leadId: reply.referralLeadId }; // already captured (redelivery)

  // Atomically CLAIM this reply before creating, so two concurrent calls (webhook redelivery racing a
  // manual retry) can't both create a lead and leave an orphan in Bison. The claim flips
  // referralStatus null → 'creating' guarded by isNull — only one caller wins; the rest bail.
  const claimed = await db.update(bisonReplies)
    .set({ referralStatus: 'creating' })
    .where(and(eq(bisonReplies.id, reply.id), isNull(bisonReplies.referralStatus)))
    .returning({ id: bisonReplies.id });
  if (!claimed.length) {
    // Someone else is creating (or already did). Read back the resolved lead id, if any.
    const [row] = await db.select({ leadId: bisonReplies.referralLeadId }).from(bisonReplies).where(eq(bisonReplies.id, reply.id));
    return { leadId: row?.leadId ?? null };
  }

  const [firstName, ...rest] = (referral.name ?? '').split(/\s+/).filter(Boolean);
  const lead: BisonLead = {
    email: referral.email,
    first_name: firstName || undefined,
    last_name: rest.join(' ') || undefined,
    title: referral.title || undefined,
    // Trace where this lead came from, for anyone auditing the contact later.
    custom_variables: [
      { name: 'source', value: 'reply_referral' },
      { name: 'referred_by', value: reply.leadEmail ?? '' },
    ],
  };

  let leadId: number | null = null;
  let error: string | undefined;
  try {
    const client = await bisonClientFor(reply.workspaceId);
    leadId = await client.createLead(lead);
    if (!leadId) error = 'Bison createLead returned no id';
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    console.error('[referral] create lead failed', e);
  }

  // Resolve the claim: record the lead id and move to pending_confirm. If the create failed (no id),
  // release the claim back to null so a later retry can attempt it again rather than getting stuck.
  await db.update(bisonReplies)
    .set({ referralLeadId: leadId, referralStatus: leadId ? 'pending_confirm' : null })
    .where(eq(bisonReplies.id, reply.id));

  return { leadId, error };
}
