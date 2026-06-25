/** Connectors API: per-connector status + (for HubSpot) sync coverage & freshness. */
import { Router } from 'express';
import { and, count, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies, contacts, runs, workspaces } from '../../db/schema.js';
import { config } from '../../lib/config.js';
import { getSecret, secretStatus } from '../../lib/secrets.js';
import { testConnection } from '../../engine/adapters/hubspot.js';
import { creditBalance as oceanBalance } from '../../engine/adapters/ocean.js';
import { credits as bouncerCredits } from '../../engine/adapters/bouncer.js';
import { creditCount as airscaleCredits } from '../../engine/adapters/airscale.js';
import { asyncHandler } from '../middleware.js';

export const connectorsRouter = Router();

/**
 * Live vendor credit balances, each translated into a relatable "what can I do with this" metric.
 * Fetched in parallel; any vendor that errors (or has no key) returns null so the UI degrades.
 */
connectorsRouter.get('/credits', asyncHandler(async (_req, res) => {
  const safe = async <T>(on: boolean, fn: () => Promise<T>): Promise<T | null> => {
    if (!on) return null;
    try { return await fn(); } catch { return null; }
  };
  const [ocean, bouncer, airscale] = await Promise.all([
    safe(!!config.oceanKey, oceanBalance),
    safe(!!config.bouncerKey, bouncerCredits),
    safe(!!config.airscaleKey, airscaleCredits),
  ]);

  const oceanTotal = ocean ? (ocean.credits.oneTime ?? 0) + (ocean.credits.recurrent ?? 0) : null;
  // `metrics` is a structured list (rendered as bullets), not a prose sentence. `fetchedAt` lets the
  // UI show a "last updated" tag; re-hitting this endpoint (the Sync button) refreshes it live.
  res.json({
    fetchedAt: new Date().toISOString(),
    vendors: [
      {
        id: 'ocean', name: 'Ocean.io', credits: oceanTotal, configured: !!config.oceanKey,
        metrics: oceanTotal == null ? [] : [
          `~${oceanTotal.toLocaleString()} company enrichments`,
          `~${Math.floor(oceanTotal / 25).toLocaleString()} lookalike searches (25 each)`,
        ],
      },
      {
        id: 'bouncer', name: 'Bouncer', credits: bouncer, configured: !!config.bouncerKey,
        metrics: bouncer == null ? [] : [`~${bouncer.toLocaleString()} email verifications`],
      },
      {
        id: 'airscale', name: 'Airscale', credits: airscale, configured: !!config.airscaleKey,
        metrics: airscale == null ? [] : [
          `~${airscale.toLocaleString()} contact email lookups`,
          `~${(airscale * 10).toLocaleString()} leads listed`,
        ],
      },
    ],
  });
}));

/**
 * Overview: one entry per connector, unifying STATUS and the KEY that configures it — so a connector
 * is fixed where it's shown (no separate keys list). Each entry carries its secret name + masked
 * preview + where it resolves from, plus a terse role. Email Bison is the exception: it has no global
 * key (each workspace authenticates as itself), so it's marked perWorkspace and links to Workspaces.
 * Status/preview are DB-first (in-app Settings) then env.
 */
connectorsRouter.get('/', asyncHandler(async (_req, res) => {
  // Email Bison has no global key — connected if ANY workspace has its own key set.
  const wsRows = await db.select({ slug: workspaces.slug }).from(workspaces);
  const wsKeys = await Promise.all(wsRows.map((w) => getSecret(`EMAILBISON_API_KEY__${w.slug}`)));
  const bisonConnected = wsKeys.some((k) => !!k);

  const SPEC = [
    { id: 'hubspot', name: 'HubSpot', role: 'System of record', key: 'HUBSPOT_TOKEN' },
    { id: 'emailbison', name: 'Email Bison', role: 'Cold email', perWorkspace: true, manage: '/email/workspaces' },
    { id: 'heyreach', name: 'HeyReach', role: 'LinkedIn outreach', key: 'HEYREACH_API_KEY' },
    { id: 'ocean', name: 'Ocean.io', role: 'Discovery & enrichment', key: 'OCEAN_API_KEY' },
    { id: 'bouncer', name: 'Bouncer', role: 'Email verification', key: 'BOUNCER_API_KEY' },
    { id: 'airscale', name: 'Airscale', role: 'People & email finding', key: 'AIRSCALE_API_KEY' },
    { id: 'anthropic', name: 'Anthropic', role: 'AI — classifier, sequence writer, reply triage', key: 'ANTHROPIC_API_KEY' },
  ] as const;

  const connectors = await Promise.all(SPEC.map(async (s) => {
    if ('perWorkspace' in s) {
      return { id: s.id, name: s.name, role: s.role, connected: bisonConnected, perWorkspace: true, manage: s.manage };
    }
    const st = await secretStatus(s.key);
    return { id: s.id, name: s.name, role: s.role, connected: st.set, key: s.key, masked: st.masked, source: st.source };
  }));
  res.json({ connectors });
}));

/** HubSpot sync coverage + freshness, per object. */
connectorsRouter.get('/hubspot', asyncHandler(async (_req, res) => {
  const [[coTotal], [coSynced], [ctTotal], [ctSynced]] = await Promise.all([
    db.select({ n: count() }).from(companies),
    db.select({ n: count() }).from(companies).where(and(isNotNull(companies.hubspotId), ne(companies.hubspotId, ''))),
    db.select({ n: count() }).from(contacts),
    db.select({ n: count() }).from(contacts).where(and(isNotNull(contacts.hubspotId), ne(contacts.hubspotId, ''))),
  ]);
  // last pull/push runs
  const lastRun = async (kind: string) => {
    const [r] = await db.select({ at: runs.finishedAt }).from(runs)
      .where(and(eq(runs.kind, kind), eq(runs.status, 'done'))).orderBy(desc(runs.id)).limit(1);
    return r?.at ?? null;
  };
  const [pullCompanies, pullContacts, push] = await Promise.all([
    lastRun('pull-hubspot-companies'), lastRun('pull-hubspot-contacts'), lastRun('push-hubspot-companies'),
  ]);
  const pct = (s: number, t: number) => (t ? Math.round((s / t) * 100) : 0);
  // Live token test — actually pings HubSpot rather than just checking the token exists.
  const test = await testConnection();
  // Safe fingerprint (NOT the secret): lets us confirm WHICH token Railway actually has +
  // catch hidden whitespace/truncation without ever exposing the value.
  const tok = config.hubspotToken;
  const fingerprint = tok
    ? { prefix: tok.slice(0, 11), len: tok.length, last4: tok.slice(-4), hasWhitespace: /\s/.test(tok) }
    : null;
  res.json({
    connected: !!config.hubspotToken,
    tokenValid: test.ok,
    tokenDetail: test.ok ? 'Token verified' : test.detail,
    tokenFingerprint: fingerprint,
    companies: { total: coTotal.n, synced: coSynced.n, coverage: pct(coSynced.n, coTotal.n) },
    contacts: { total: ctTotal.n, synced: ctSynced.n, coverage: pct(ctSynced.n, ctTotal.n) },
    lastSync: { pullCompanies, pullContacts, push },
  });
  void sql;
}));
