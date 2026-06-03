/**
 * Verify stage — run emails through Bouncer (the de-bounce gate), respecting the
 * TTL cache in `verifications`. Applies keep/flag rules → contact.emailStatus.
 * Ported rules from the ESO run's stage5.
 */
import { and, eq, isNotNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { contacts, verifications } from '../../db/schema.js';
import { batchVerify, type BouncerResult } from '../adapters/bouncer.js';
import { isValidEmail } from '../normalize.js';

/** Map a Bouncer result → the contact email_status label (ESO keep/flag rules). */
export function emailStatusOf(r: BouncerResult): string {
  const accept = r.domain?.acceptAll === 'yes';
  const role = r.account?.role === 'yes';
  const disposable = r.domain?.disposable === 'yes';
  if (disposable) return 'undeliverable';
  if (r.status === 'deliverable') return role ? 'role_based' : 'deliverable';
  if (r.status === 'risky') return role ? 'role_based' : accept ? 'risky_catchall' : 'risky';
  if (r.status === 'undeliverable') return 'undeliverable';
  return 'unknown';
}

/** Emails in the store that need (re)verification: valid, and not freshly cached. */
export async function emailsNeedingVerification(limit = 100000): Promise<string[]> {
  // contacts with a valid-looking email whose verification is missing or past TTL
  const rows = await db
    .select({ email: contacts.email })
    .from(contacts)
    .leftJoin(verifications, eq(verifications.email, contacts.email))
    .where(
      and(
        isNotNull(contacts.email),
        or(
          sql`${verifications.email} is null`,
          lt(verifications.verifiedAt, sql`now() - (${verifications.ttlDays} || ' days')::interval`),
        ),
      ),
    )
    .limit(limit);
  return [...new Set(rows.map((r) => r.email!).filter(isValidEmail))];
}

/** Verify the given emails via Bouncer, cache results, and update contact statuses. */
export async function verifyEmails(
  emails: string[],
  log: (m: string) => void = console.log,
): Promise<{ verified: number; byStatus: Record<string, number> }> {
  const targets = [...new Set(emails.map((e) => e.toLowerCase()).filter(isValidEmail))];
  if (!targets.length) return { verified: 0, byStatus: {} };

  const results = await batchVerify(targets, log);
  const byStatus: Record<string, number> = {};

  for (const r of results) {
    const email = (r.email ?? '').toLowerCase();
    if (!email) continue;
    const status = emailStatusOf(r);
    byStatus[status] = (byStatus[status] ?? 0) + 1;

    // cache
    await db.insert(verifications).values({
      email,
      status: r.status,
      score: r.score ?? null,
      acceptAll: r.domain?.acceptAll === 'yes',
      roleBased: r.account?.role === 'yes',
      disposable: r.domain?.disposable === 'yes',
      reason: r.reason ?? null,
      verifiedAt: new Date(),
    }).onConflictDoUpdate({
      target: verifications.email,
      set: {
        status: r.status, score: r.score ?? null,
        acceptAll: r.domain?.acceptAll === 'yes', roleBased: r.account?.role === 'yes',
        disposable: r.domain?.disposable === 'yes', reason: r.reason ?? null, verifiedAt: new Date(),
      },
    });

    // update the contact's status
    await db.update(contacts).set({ emailStatus: status }).where(eq(contacts.email, email));
  }
  return { verified: results.length, byStatus };
}
