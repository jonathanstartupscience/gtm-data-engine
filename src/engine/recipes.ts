/**
 * Recipes — named end-to-end flows the engine can run. Each records a `runs` row
 * with a human-readable step waterfall (which provider, what action, how it went).
 * This is what the UI and CLI invoke. New recipes compose stages + adapters.
 */
import { and, inArray, isNotNull, ne } from 'drizzle-orm';
import { db } from '../db/index.js';
import { companies, contacts } from '../db/schema.js';
import { startRun, finishRun, StepRecorder } from './runs.js';
import { emailsNeedingVerification, verifyEmails } from './stages/verify.js';
import { ingestRows, type EntityType, type Mapping } from './stages/ingest.js';
import { companiesNeedingEnrichment, enrichCompanies } from './stages/enrich.js';
import { discoverLookalikes } from './stages/discover.js';
import { pullCompanies, pullContacts } from './stages/pull.js';
import { previewPush, executePush, type PushPreview } from './stages/push.js';
import { pushToBison, type SegmentFilter } from './stages/activate.js';
import { findContacts } from './stages/findContacts.js';
import { discoverContacts, findEmailsForContacts, type DiscoverPeopleFilters } from './stages/discoverContacts.js';
import { generateSequence, type GenerateSequenceOpts, type GenerateSequenceResult } from './stages/generate-sequence.js';
import { rewriteStep, type RewriteStepOpts, type RewriteStepResult } from './stages/rewrite-step.js';
import { anthropicComplete, extractJson, MODEL_OPUS } from './adapters/anthropic.js';
import { runExperiment, type ExperimentPushResult } from './stages/experiment.js';

/** find-contacts: discover people for a persona at companies missing it (Airscale). */
export async function runFindContacts(
  opts: {
    persona?: string; type?: string; subType?: string; country?: string; onlyMissingPersona?: boolean;
    titlesInclude?: string[]; titlesExclude?: string[]; locations?: string[]; keyword?: string; limitCompanies?: number;
  },
  log: (m: string) => void = console.log,
): Promise<RecipeResult> {
  const runId = await startRun('find-contacts');
  const rec = new StepRecorder(log);
  try {
    rec.step({ provider: 'Engine', status: 'info', label: 'Selecting companies to source contacts at',
      detail: [opts.type, opts.subType, opts.country, opts.persona].filter(Boolean).join(' · ') });
    const r = await findContacts(opts, log);
    rec.step({ provider: 'Airscale', status: 'ok', label: 'Discovered people', count: r.found,
      detail: `${r.added} added across ${r.companies} companies${r.errors ? `, ${r.errors} errors` : ''}` });
    await finishRun(runId, 'done', r, rec.steps);
    return { runId, kind: 'find-contacts', stats: r as unknown as Record<string, unknown> };
  } catch (err) {
    rec.step({ provider: 'Airscale', status: 'error', label: 'Find contacts failed', detail: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
    throw err;
  }
}

/** discover-contacts: find NET-NEW people across all companies by title/keyword (Airscale), no email. */
export async function runDiscoverContacts(
  opts: DiscoverPeopleFilters & { maxLeads?: number },
  log: (m: string) => void = console.log,
): Promise<RecipeResult> {
  const runId = await startRun('discover-contacts');
  const rec = new StepRecorder(log);
  try {
    rec.step({ provider: 'Engine', status: 'info', label: 'Searching people by title/keyword',
      detail: [opts.titlesInclude?.join(', '), opts.keyword].filter(Boolean).join(' · ') || 'any' });
    const r = await discoverContacts(opts, log);
    rec.step({ provider: 'Airscale', status: 'ok', label: 'Discovered people', count: r.found,
      detail: `${r.added} added across ${r.companiesCreated} companies${r.noCompany ? `, ${r.noCompany} without a company` : ''}${r.errors ? `, ${r.errors} errors` : ''}` });
    await finishRun(runId, 'done', r, rec.steps);
    return { runId, kind: 'discover-contacts', stats: r as unknown as Record<string, unknown> };
  } catch (err) {
    rec.step({ provider: 'Airscale', status: 'error', label: 'Discover contacts failed', detail: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
    throw err;
  }
}

/** find-emails: find emails (Airscale waterfall) for selected contacts that lack one. */
export async function runFindEmailsForContacts(
  contactIds: number[],
  log: (m: string) => void = console.log,
): Promise<RecipeResult> {
  const runId = await startRun('find-emails');
  const rec = new StepRecorder(log);
  try {
    rec.step({ provider: 'Engine', status: 'info', label: 'Selecting contacts that need an email', count: contactIds.length });
    const r = await findEmailsForContacts(contactIds, log);
    rec.step({ provider: 'Airscale', status: 'ok', label: 'Found emails', count: r.emailsFound,
      detail: `${r.emailsFound} of ${r.attempted} attempted${r.skipped ? `, ${r.skipped} skipped` : ''}${r.errors ? `, ${r.errors} errors` : ''}` });
    await finishRun(runId, 'done', r, rec.steps);
    return { runId, kind: 'find-emails', stats: r as unknown as Record<string, unknown> };
  } catch (err) {
    rec.step({ provider: 'Airscale', status: 'error', label: 'Find emails failed', detail: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
    throw err;
  }
}

/** push-email-bison: send a filtered campaign-ready segment to an Email Bison campaign. */
export async function runPushToBison(
  workspaceId: number | null | undefined,
  bisonCampaignId: number,
  filter: SegmentFilter,
  log: (m: string) => void = console.log,
): Promise<RecipeResult> {
  const runId = await startRun('push-email-bison');
  const rec = new StepRecorder(log);
  try {
    rec.step({ provider: 'Engine', status: 'info', label: 'Selected campaign-ready segment',
      detail: [filter.persona, filter.subType].filter(Boolean).join(' · ') || 'all personas' });
    const r = await pushToBison(workspaceId, bisonCampaignId, filter, log);
    rec.step({ provider: 'Email Bison', status: 'ok', label: 'Pushed to campaign', count: r.created,
      detail: `${r.created} leads created, ${r.attached} attached${r.failed ? `, ${r.failed} failed` : ''}` });
    await finishRun(runId, 'done', { bisonCampaignId, ...r }, rec.steps);
    return { runId, kind: 'push-email-bison', stats: { bisonCampaignId, ...r } };
  } catch (err) {
    rec.step({ provider: 'Email Bison', status: 'error', label: 'Push failed', detail: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
    throw err;
  }
}

/** generate-sequence: compose a cold-email sequence (style × persona) in Greg's voice via Opus. */
export async function runGenerateSequence(
  opts: GenerateSequenceOpts,
  log: (m: string) => void = console.log,
): Promise<RecipeResult & { result: GenerateSequenceResult }> {
  const runId = await startRun('generate-sequence');
  const rec = new StepRecorder(log);
  try {
    rec.step({ provider: 'Engine', status: 'info', label: 'Composing cold-email sequence',
      detail: [opts.styleKey, opts.persona, opts.leadMagnetId].filter(Boolean).join(' · ') });
    const result = await generateSequence(
      opts,
      (prompt) => anthropicComplete({ prompt, model: MODEL_OPUS }),
      extractJson,
      log,
    );
    rec.step({ provider: 'Anthropic', status: 'ok', label: 'Generated sequence', count: result.steps.length,
      detail: `${result.styleName} · ${result.personaName}` });
    const stats = {
      styleKey: result.styleKey, personaKey: result.personaKey, steps: result.steps.length,
      painKey: result.painKey, painLabel: result.painLabel,
      abVariant: result.abVariant, leadMagnetId: result.leadMagnetId,
    };
    await finishRun(runId, 'done', stats, rec.steps);
    return { runId, kind: 'generate-sequence', stats, result };
  } catch (err) {
    rec.step({ provider: 'Anthropic', status: 'error', label: 'Generation failed', detail: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
    throw err;
  }
}

/** rewrite-step: apply a targeted rewrite to one existing cold-email step via Opus. */
export async function runRewriteStep(
  opts: RewriteStepOpts,
  log: (m: string) => void = console.log,
): Promise<RecipeResult & { result: RewriteStepResult }> {
  const runId = await startRun('rewrite-step');
  const rec = new StepRecorder(log);
  try {
    rec.step({ provider: 'Engine', status: 'info', label: 'Rewriting cold-email step',
      detail: [opts.action, opts.styleKey, opts.persona].filter(Boolean).join(' · ') });
    const result = await rewriteStep(
      opts,
      (prompt) => anthropicComplete({ prompt, model: MODEL_OPUS }),
      extractJson,
      log,
    );
    rec.step({ provider: 'Anthropic', status: 'ok', label: 'Rewrote step', detail: result.note || opts.action });
    const stats = { action: opts.action, styleKey: opts.styleKey ?? null };
    await finishRun(runId, 'done', stats, rec.steps);
    return { runId, kind: 'rewrite-step', stats, result };
  } catch (err) {
    rec.step({ provider: 'Anthropic', status: 'error', label: 'Rewrite failed', detail: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
    throw err;
  }
}

/** experiment-push: assign new contacts to arms and push each arm's unsent contacts to Bison. */
export async function runExperimentPush(
  experimentId: number,
  log: (m: string) => void = console.log,
): Promise<RecipeResult & { result: ExperimentPushResult }> {
  const runId = await startRun('experiment-push');
  const rec = new StepRecorder(log);
  try {
    rec.step({ provider: 'Engine', status: 'info', label: 'Allocating + pushing experiment', detail: `experiment #${experimentId}` });
    const result = await runExperiment(experimentId, log);
    rec.step({ provider: 'Engine', status: 'ok', label: 'Assigned new contacts', count: result.assignedNew });
    for (const a of result.perArm) {
      rec.step({ provider: 'Email Bison', status: a.failed && !a.pushed ? 'warn' : 'ok',
        label: `Pushed arm "${a.label ?? a.armId}"`, count: a.pushed,
        detail: a.failed ? `${a.failed} failed` : undefined });
    }
    const stats = { experimentId, assignedNew: result.assignedNew, totalPushed: result.totalPushed, totalFailed: result.totalFailed };
    await finishRun(runId, 'done', stats, rec.steps);
    return { runId, kind: 'experiment-push', stats, result };
  } catch (err) {
    rec.step({ provider: 'Engine', status: 'error', label: 'Experiment push failed', detail: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
    throw err;
  }
}

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

/** verify-selected: verify emails for a chosen set of contact IDs (credit-safe — never the whole DB). */
export async function runVerifyContacts(
  contactIds: number[],
  log: (m: string) => void = console.log,
): Promise<RecipeResult> {
  const rows = await db.select({ email: contacts.email }).from(contacts)
    .where(and(inArray(contacts.id, contactIds), isNotNull(contacts.email), ne(contacts.email, '')));
  const emails = [...new Set(rows.map((r) => r.email!).filter(Boolean))];
  log(`Verifying ${emails.length} selected contact emails…`);
  return runVerifyEmails(emails, log);
}

/** enrich-selected: enrich a chosen set of company IDs (credit-safe). */
export async function runEnrichSelected(
  companyIds: number[],
  log: (m: string) => void = console.log,
): Promise<RecipeResult> {
  const runId = await startRun('enrich-companies');
  const rec = new StepRecorder(log);
  try {
    const rows = await db.select({ id: companies.id, domain: companies.domain }).from(companies)
      .where(and(inArray(companies.id, companyIds), isNotNull(companies.domain), ne(companies.domain, '')));
    const targets = rows.filter((r) => r.domain) as { id: number; domain: string }[];
    rec.step({ provider: 'Engine', status: 'info', label: 'Selected companies with a domain', count: targets.length, detail: `${targets.length} of ${companyIds.length} selected` });
    const r = await enrichCompanies(targets, log);
    rec.step({ provider: 'Ocean.io', status: 'ok', label: 'Enriched via Ocean', count: r.enriched, detail: `${r.enriched} companies, ${r.filledFields} fields filled` });
    await finishRun(runId, 'done', r, rec.steps);
    return { runId, kind: 'enrich-companies', stats: r as unknown as Record<string, unknown> };
  } catch (err) {
    rec.step({ provider: 'Engine', status: 'error', label: 'Enrichment failed', detail: (err as Error).message });
    await finishRun(runId, 'error', { error: (err as Error).message }, rec.steps);
    throw err;
  }
}
