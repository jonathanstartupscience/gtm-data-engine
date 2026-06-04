/** Connectors API: per-connector status + (for HubSpot) sync coverage & freshness. */
import { Router } from 'express';
import { and, count, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies, contacts, runs } from '../../db/schema.js';
import { config } from '../../lib/config.js';
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
  // Ocean enrich = 1 credit/company; a lookalike search batch ~ size companies. Express both.
  res.json({
    vendors: [
      {
        id: 'ocean', name: 'Ocean.io', credits: oceanTotal, configured: !!config.oceanKey,
        relatable: oceanTotal == null ? null
          : `~${oceanTotal.toLocaleString()} company enrichments, or ~${Math.floor(oceanTotal / 25).toLocaleString()} lookalike searches (25 each)`,
      },
      {
        id: 'bouncer', name: 'Bouncer', credits: bouncer, configured: !!config.bouncerKey,
        relatable: bouncer == null ? null : `~${bouncer.toLocaleString()} email verifications`,
      },
      {
        id: 'airscale', name: 'Airscale', credits: airscale, configured: !!config.airscaleKey,
        // ~1 credit per email found, ~0.1 per lead listed.
        relatable: airscale == null ? null
          : `~${airscale.toLocaleString()} contact email lookups, or ~${(airscale * 10).toLocaleString()} leads listed`,
      },
    ],
  });
}));

/** Overview: each connector + connected status + role. */
connectorsRouter.get('/', asyncHandler(async (_req, res) => {
  res.json({
    connectors: [
      { id: 'hubspot', name: 'HubSpot', role: 'System of record — sync companies & contacts both ways', connected: !!config.hubspotToken },
      { id: 'emailbison', name: 'Email Bison', role: 'Cold email — push campaign-ready segments to campaigns', connected: !!config.emailBisonKey },
      { id: 'heyreach', name: 'Heyreach', role: 'LinkedIn outreach — not currently enabled', connected: !!config.heyreachKey },
      { id: 'ocean', name: 'Ocean.io', role: 'Discovery & enrichment', connected: !!config.oceanKey },
      { id: 'bouncer', name: 'Bouncer', role: 'Email verification', connected: !!config.bouncerKey },
      { id: 'airscale', name: 'Airscale', role: 'People & email finding', connected: !!config.airscaleKey },
    ],
  });
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
