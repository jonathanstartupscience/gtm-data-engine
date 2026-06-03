/**
 * Recipes — named end-to-end flows the engine can run. Each records a `runs` row
 * with a human-readable step waterfall (which provider, what action, how it went).
 * This is what the UI and CLI invoke. New recipes compose stages + adapters.
 */
import { startRun, finishRun, StepRecorder } from './runs.js';
import { emailsNeedingVerification, verifyEmails } from './stages/verify.js';
import { ingestRows, type EntityType, type Mapping } from './stages/ingest.js';
import { companiesNeedingEnrichment, enrichCompanies } from './stages/enrich.js';
import { discoverLookalikes } from './stages/discover.js';
import { pullCompanies, pullContacts } from './stages/pull.js';
import { previewPush, executePush, type PushPreview } from './stages/push.js';

/** push-preview: compute what pushing to HubSpot WOULD change (no writes). */
export async function runPushPreview(
  opts: { limit?: number } = {},
  log: (m: string) => void = console.log,
): Promise<PushPreview> {
  return previewPush(opts, log);
}

/** push-execute: write to HubSpot. Caller must have shown + confirmed the preview. */
export async function runPushExecute(
  opts: { limit?: number } = {},
  log: (m: string) => void = console.log,
): Promise<RecipeResult> {
  const runId = await startRun('push-hubspot-companies');
  const rec = new StepRecorder(log);
  try {
    rec.step({ provider: 'Engine', status: 'info', label: 'Pushing companies to HubSpot (confirmed)' });
    const r = await executePush(opts, log);
    rec.step({ provider: 'HubSpot', status: 'ok', label: 'Wrote to HubSpot',
      detail: `${r.created} created, ${r.updated} updated, ${r.unchanged} unchanged${r.errors ? `, ${r.errors} errors` : ''}` });
    await finishRun(runId, 'done', r, rec.steps);
    return { runId, kind: 'push-hubspot-companies', stats: r as unknown as Record<string, unknown> };
  } catch (err) {
    rec.step({ provider: 'HubSpot', status: 'error', label: 'Push failed', detail: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
    throw err;
  }
}

export type RecipeName = 'verify-stale' | 'verify-emails' | 'import-list'
  | 'enrich-companies' | 'discover-lookalikes' | 'pull-hubspot-companies' | 'pull-hubspot-contacts';

/** pull-hubspot-contacts: import contacts from HubSpot (associated to companies) → store. */
export async function runPullContacts(
  opts: { limit?: number } = {},
  log: (m: string) => void = console.log,
): Promise<RecipeResult> {
  const runId = await startRun('pull-hubspot-contacts');
  const rec = new StepRecorder(log);
  try {
    rec.step({ provider: 'HubSpot', status: 'info', label: 'Pulling contacts from HubSpot',
      detail: opts.limit ? `capped at ${opts.limit}` : 'all contacts' });
    const r = await pullContacts(opts, log);
    rec.step({ provider: 'HubSpot', status: 'ok', label: 'Pulled contacts', count: r.pulled, detail: `${r.pages} pages` });
    rec.step({ provider: 'Engine', status: 'ok', label: 'Resolved + associated', count: r.resolved,
      detail: `${r.resolved} contacts${r.errors ? `, ${r.errors} errors` : ''}` });
    if (r.capped) rec.step({ provider: 'Engine', status: 'warn', label: 'Stopped at cap', detail: 'more remain in HubSpot' });
    await finishRun(runId, 'done', r, rec.steps);
    return { runId, kind: 'pull-hubspot-contacts', stats: r as unknown as Record<string, unknown> };
  } catch (err) {
    rec.step({ provider: 'HubSpot', status: 'error', label: 'Pull failed', detail: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
    throw err;
  }
}

/** pull-hubspot-companies: import companies from HubSpot (all Types/Sub-types) → store. */
export async function runPullCompanies(
  opts: { limit?: number } = {},
  log: (m: string) => void = console.log,
): Promise<RecipeResult> {
  const runId = await startRun('pull-hubspot-companies');
  const rec = new StepRecorder(log);
  try {
    rec.step({ provider: 'HubSpot', status: 'info', label: 'Pulling companies from HubSpot',
      detail: opts.limit ? `capped at ${opts.limit}` : 'all companies' });
    const r = await pullCompanies(opts, log);
    rec.step({ provider: 'HubSpot', status: 'ok', label: 'Pulled companies', count: r.pulled, detail: `${r.pages} pages` });
    rec.step({ provider: 'Engine', status: 'ok', label: 'Resolved into store', count: r.resolved,
      detail: `${r.resolved} golden records${r.errors ? `, ${r.errors} errors` : ''}` });
    if (r.capped) rec.step({ provider: 'Engine', status: 'warn', label: 'Stopped at cap', detail: 'more remain in HubSpot' });
    await finishRun(runId, 'done', r, rec.steps);
    return { runId, kind: 'pull-hubspot-companies', stats: r as unknown as Record<string, unknown> };
  } catch (err) {
    rec.step({ provider: 'HubSpot', status: 'error', label: 'Pull failed', detail: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
    throw err;
  }
}

export interface RecipeResult {
  runId: number;
  kind: string;
  stats: Record<string, unknown>;
}

/** discover-lookalikes: find NEW target companies similar to seed domains (growth engine). */
export async function runDiscoverLookalikes(
  opts: { seedDomains: string[]; type?: string; subType?: string; size?: number },
  log: (m: string) => void = console.log,
): Promise<RecipeResult> {
  const runId = await startRun('discover-lookalikes');
  const rec = new StepRecorder(log);
  try {
    rec.step({ provider: 'Engine', status: 'info', label: 'Selected seed companies',
      detail: `${opts.seedDomains.length} seeds${opts.subType ? `, sub-type "${opts.subType}"` : ''}` });
    const r = await discoverLookalikes(opts, log);
    if (r.planGated) {
      rec.step({ provider: 'Ocean.io', status: 'warn', label: 'Lookalike search unavailable', detail: r.message });
    } else {
      rec.step({ provider: 'Ocean.io', status: 'ok', label: 'Searched for lookalike companies', count: r.found, detail: `${r.found} candidates returned` });
      rec.step({ provider: 'Engine', status: 'ok', label: 'Resolved into store', detail: `${r.newCompanies} new, ${r.alreadyKnown} already known` });
    }
    await finishRun(runId, 'done', r, rec.steps);
    return { runId, kind: 'discover-lookalikes', stats: r as unknown as Record<string, unknown> };
  } catch (err) {
    rec.step({ provider: 'Engine', status: 'error', label: 'Discovery failed', detail: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
    throw err;
  }
}

/** enrich-companies: fill firmographic gaps via Ocean for companies missing them. */
export async function runEnrichCompanies(
  opts: { limit?: number; dryRun?: boolean } = {},
  log: (m: string) => void = console.log,
): Promise<RecipeResult> {
  const runId = await startRun('enrich-companies');
  const rec = new StepRecorder(log);
  try {
    const targets = await companiesNeedingEnrichment(opts.limit ?? 1000);
    rec.step({ provider: 'Engine', status: 'info', label: 'Found companies missing firmographics', count: targets.length, detail: `${targets.length} candidates` });
    if (opts.dryRun) {
      const stats = { candidates: targets.length, dryRun: true };
      rec.step({ provider: 'Engine', status: 'info', label: 'Dry run — no changes made' });
      await finishRun(runId, 'done', stats, rec.steps);
      return { runId, kind: 'enrich-companies', stats };
    }
    const r = await enrichCompanies(targets, log);
    rec.step({ provider: 'Ocean.io', status: 'ok', label: 'Enriched via Ocean', count: r.enriched, detail: `${r.enriched} companies, ${r.filledFields} fields filled` });
    if (r.errors) rec.step({ provider: 'Ocean.io', status: 'warn', label: 'Some lookups failed', count: r.errors, detail: `${r.errors} errors` });
    await finishRun(runId, 'done', r, rec.steps);
    return { runId, kind: 'enrich-companies', stats: r as unknown as Record<string, unknown> };
  } catch (err) {
    rec.step({ provider: 'Engine', status: 'error', label: 'Enrichment failed', detail: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
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
  const rec = new StepRecorder(log);
  try {
    rec.step({ provider: 'Engine', status: 'info', label: `Parsed "${sourceName}"`, count: rows.length, detail: `${rows.length} ${entityType} rows` });
    const r = await ingestRows(rows, entityType, mapping, sourceName, log);
    rec.step({ provider: 'Engine', status: 'ok', label: 'Resolved into canonical store',
      detail: `${r.resolved} resolved (${entityType === 'company' ? r.companies + ' companies' : r.contacts + ' contacts'})` });
    if (r.errors) rec.step({ provider: 'Engine', status: 'warn', label: 'Skipped rows', count: r.errors, detail: `${r.errors} rows missing required fields` });
    await finishRun(runId, 'done', r, rec.steps);
    return { runId, kind: 'import-list', stats: r as unknown as Record<string, unknown> };
  } catch (err) {
    rec.step({ provider: 'Engine', status: 'error', label: 'Import failed', detail: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
    throw err;
  }
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
  const rec = new StepRecorder(log);
  try {
    const emails = await emailsNeedingVerification(opts.limit ?? 100000);
    rec.step({ provider: 'Engine', status: 'info', label: 'Found emails needing verification', count: emails.length, detail: `${emails.length} (missing or older than 90 days)` });
    if (opts.dryRun) {
      const stats = { candidates: emails.length, dryRun: true };
      rec.step({ provider: 'Engine', status: 'info', label: 'Dry run — no verification spent' });
      await finishRun(runId, 'done', stats, rec.steps);
      return { runId, kind: 'verify-stale', stats };
    }
    const { verified, byStatus } = await verifyEmails(emails, log);
    rec.step({ provider: 'Bouncer', status: 'ok', label: 'Verified emails', count: verified,
      detail: Object.entries(byStatus).map(([k, v]) => `${v} ${k}`).join(', ') });
    const stats = { candidates: emails.length, verified, byStatus };
    await finishRun(runId, 'done', stats, rec.steps);
    return { runId, kind: 'verify-stale', stats };
  } catch (err) {
    rec.step({ provider: 'Engine', status: 'error', label: 'Verification failed', detail: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
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
