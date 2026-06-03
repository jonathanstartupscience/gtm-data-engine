/**
 * Recipes — named end-to-end flows the engine can run. Each records a `runs` row.
 * This is what the UI and CLI invoke. New recipes compose stages + adapters.
 */
import { startRun, finishRun } from './runs.js';
import { emailsNeedingVerification, verifyEmails } from './stages/verify.js';
import { ingestRows, type EntityType, type Mapping } from './stages/ingest.js';
import { companiesNeedingEnrichment, enrichCompanies } from './stages/enrich.js';

export type RecipeName = 'verify-stale' | 'verify-emails' | 'import-list' | 'enrich-companies';

/** enrich-companies: fill firmographic gaps via Ocean for companies missing them. */
export async function runEnrichCompanies(
  opts: { limit?: number; dryRun?: boolean } = {},
  log: (m: string) => void = console.log,
): Promise<RecipeResult> {
  const runId = await startRun('enrich-companies');
  try {
    const targets = await companiesNeedingEnrichment(opts.limit ?? 1000);
    log(`enrich-companies: ${targets.length} companies missing firmographics`);
    if (opts.dryRun) {
      const stats = { candidates: targets.length, dryRun: true };
      await finishRun(runId, 'done', stats);
      return { runId, kind: 'enrich-companies', stats };
    }
    const r = await enrichCompanies(targets, log);
    await finishRun(runId, 'done', r);
    return { runId, kind: 'enrich-companies', stats: r as unknown as Record<string, unknown> };
  } catch (err) {
    await finishRun(runId, 'error', { error: (err as Error).message });
    throw err;
  }
}

/** import-list: ingest parsed CSV rows → dedupe → resolve into the store. */
export async function runImportList(
  rows: Record<string, string>[],
  entityType: EntityType,
  mapping: Mapping,
  sourceName: string,
  log: (m: string) => void = console.log,
): Promise<RecipeResult> {
  const runId = await startRun('import-list');
  try {
    log(`import-list: ${rows.length} ${entityType} rows from "${sourceName}"`);
    const r = await ingestRows(rows, entityType, mapping, sourceName, log);
    const stats = { ...r };
    await finishRun(runId, 'done', stats);
    return { runId, kind: 'import-list', stats };
  } catch (err) {
    await finishRun(runId, 'error', { error: (err as Error).message });
    throw err;
  }
}

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
