/**
 * Central config: loads env, exposes typed secrets + provider selection.
 * Mirrors the ESO run's config.py. Secrets come from env only (never committed).
 */
import 'dotenv/config';

function req(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

export const config = {
  databaseUrl: req('DATABASE_URL'),
  port: Number(req('PORT', '3000')),
  nodeEnv: req('NODE_ENV', 'development'),

  // Core stack (ESO-proven)
  hubspotToken: req('HUBSPOT_TOKEN'),
  airscaleKey: req('AIRSCALE_API_KEY'),
  bouncerKey: req('BOUNCER_API_KEY'),

  // Discovery
  oceanKey: req('OCEAN_API_KEY'),
  origamiKey: req('ORIGAMI_API_KEY'),

  // Activation
  emailBisonKey: req('EMAILBISON_API_KEY'),
  emailBisonBase: req('EMAILBISON_BASE_URL', 'https://dedi.emailbison.com/api'),
  heyreachKey: req('HEYREACH_API_KEY'),

  // Public app URL (for building webhook callback URLs) + the secret that guards the receiver.
  publicUrl: req('PUBLIC_URL', 'https://gtm.startupscience.io'),
  bisonWebhookSecret: req('BISON_WEBHOOK_SECRET'),
} as const;

/** Which provider runs behind each swappable stage. Change here, not in pipeline logic. */
export const providers = {
  discoverAccounts: 'ocean', // alt: origami (when available)
  discoverPeople: 'airscale', // alt: apollo, manual
  findEmails: 'airscale', // alt: findymail, prospeo (waterfall)
  verifyEmails: 'bouncer', // LOCKED
} as const;

/** Approximate per-record vendor costs (USD), for scope/cost previews. Adjust to real rates. */
export const costs = {
  oceanEnrichPerCompany: 0.02,   // Ocean enrich ~1 credit/company
  bouncerPerEmail: 0.0008,       // Bouncer ~ fraction of a cent per verification
  oceanLookalikePerCompany: 0.02,
  airscaleEmailPerLookup: 0.0075,
};

/** Throw early if a required secret for a given capability is missing. */
export function assertKeys(keys: (keyof typeof config)[]): void {
  const missing = keys.filter((k) => !config[k]);
  if (missing.length) {
    throw new Error(`Missing required config: ${missing.join(', ')} (set in .env / Railway Variables)`);
  }
}
