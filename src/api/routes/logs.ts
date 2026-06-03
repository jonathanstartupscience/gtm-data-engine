/** Logs/observability API: recent runs (errors surfaced) + integration health. */
import { Router } from 'express';
import { desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { runs } from '../../db/schema.js';
import { config } from '../../lib/config.js';
import { asyncHandler } from '../middleware.js';

export const logsRouter = Router();

/** Recent activity: last 100 runs with status + a short message, plus which runs errored. */
logsRouter.get('/', asyncHandler(async (_req, res) => {
  const rows = await db.select().from(runs).orderBy(desc(runs.id)).limit(100);
  const events = rows.map((r) => {
    const stats = (r.stats ?? {}) as Record<string, unknown>;
    let level: 'error' | 'warn' | 'info' = 'info';
    let message = '';
    if (r.status === 'error') { level = 'error'; message = String(stats.error ?? 'run failed'); }
    else if (stats.planGated) { level = 'warn'; message = String(stats.message ?? 'plan-gated'); }
    else message = summarize(stats);
    return {
      id: r.id, kind: r.kind, status: r.status, level, message,
      at: r.finishedAt ?? r.startedAt,
    };
  });
  res.json({
    events,
    integrations: {
      hubspot: !!config.hubspotToken, airscale: !!config.airscaleKey, bouncer: !!config.bouncerKey,
      ocean: !!config.oceanKey, emailBison: !!config.emailBisonKey, heyreach: !!config.heyreachKey,
    },
  });
}));

function summarize(s: Record<string, unknown>): string {
  if (s.dryRun) return `dry run · ${s.candidates ?? 0} candidates`;
  if (typeof s.verified === 'number') return `${s.verified} emails verified`;
  if (typeof s.enriched === 'number') return `${s.enriched} enriched, ${s.filledFields ?? 0} fields`;
  if (typeof s.newCompanies === 'number') return `${s.newCompanies} new companies`;
  if (typeof s.resolved === 'number') return `${s.resolved} records imported`;
  return 'completed';
}
