/**
 * Recipes — named end-to-end flows the engine can run. Each records a `runs` row.
 * This is what the UI and CLI invoke. New recipes compose stages + adapters.
 */
import { startRun, finishRun } from './runs.js';
import { emailsNeedingVerification, verifyEmails } from './stages/verify.js';

export type RecipeName = 'verify-stale' | 'verify-emails';

export interface RecipeResult {
  runId: number;
  kind: string;
  stats: Record<string, unknown>;
}

/**
 * verify-stale: find every email in the store missing/past-TTL verification and
 * run them through Bouncer. The continuous-hygiene workhorse.
 */
export async function runVerifyStale(
  opts: { limit?: number; dryRun?: boolean } = {},
  log: (m: string) => void = console.log,
): Promise<RecipeResult> {
  const runId = await startRun('verify-stale');
  try {
    const emails = await emailsNeedingVerification(opts.limit ?? 100000);
    log(`verify-stale: ${emails.length} emails need verification`);
    if (opts.dryRun) {
      const stats = { candidates: emails.length, dryRun: true };
      await finishRun(runId, 'done', stats);
      return { runId, kind: 'verify-stale', stats };
    }
    const { verified, byStatus } = await verifyEmails(emails, log);
    const stats = { candidates: emails.length, verified, byStatus };
    await finishRun(runId, 'done', stats);
    return { runId, kind: 'verify-stale', stats };
  } catch (err) {
    await finishRun(runId, 'error', { error: (err as Error).message });
    throw err;
  }
}

/** verify-emails: verify a specific list of emails (e.g. a freshly enriched batch). */
export async function runVerifyEmails(
  emails: string[],
  log: (m: string) => void = console.log,
): Promise<RecipeResult> {
  const runId = await startRun('verify-emails');
  try {
    const { verified, byStatus } = await verifyEmails(emails, log);
    const stats = { input: emails.length, verified, byStatus };
    await finishRun(runId, 'done', stats);
    return { runId, kind: 'verify-emails', stats };
  } catch (err) {
    await finishRun(runId, 'error', { error: (err as Error).message });
    throw err;
  }
}
