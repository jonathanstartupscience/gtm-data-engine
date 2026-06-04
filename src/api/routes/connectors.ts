/** Connectors API: per-connector status + (for HubSpot) sync coverage & freshness. */
import { Router } from 'express';
import { and, count, desc, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies, contacts, runs } from '../../db/schema.js';
import { config } from '../../lib/config.js';
import { testConnection } from '../../engine/adapters/hubspot.js';
import { asyncHandler } from '../middleware.js';

export const connectorsRouter = Router();

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
