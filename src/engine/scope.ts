/**
 * Workflow scope + cost estimation. Before running a credit-spending workflow, the UI calls
 * this to tell the user: how many records will be affected, the estimated cost, and what it
 * targets — so nobody runs a surprise $100 batch.
 */
import { count, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { contacts } from '../db/schema.js';
import { costs } from '../lib/config.js';
import { companiesNeedingEnrichment } from './stages/enrich.js';
import { emailsNeedingVerification } from './stages/verify.js';

export interface Scope {
  recipe: string;
  candidates: number;       // how many records this would affect
  unit: string;             // 'companies' | 'emails' | …
  estCostUsd: number;       // estimated spend
  vendor: string;           // who gets billed
  what: string;             // plain-language description of what's targeted
  free?: boolean;           // true when no $ cost (e.g. HubSpot pulls)
}

export async function scopeFor(recipe: string): Promise<Scope> {
  switch (recipe) {
    case 'enrich-companies': {
      const candidates = (await companiesNeedingEnrichment(1_000_000)).length;
      return {
        recipe, candidates, unit: 'companies',
        estCostUsd: candidates * costs.oceanEnrichPerCompany, vendor: 'Ocean.io',
        what: 'Companies that have a website but are missing employee size, founded year, or industry.',
      };
    }
    case 'verify-stale': {
      const emails = await emailsNeedingVerification(1_000_000);
      return {
        recipe, candidates: emails.length, unit: 'emails',
        estCostUsd: emails.length * costs.bouncerPerEmail, vendor: 'Bouncer',
        what: 'Email addresses never verified, or last checked more than 90 days ago.',
      };
    }
    case 'pull-hubspot-companies':
      return { recipe, candidates: -1, unit: 'companies', estCostUsd: 0, vendor: 'HubSpot', free: true,
        what: 'Imports all companies from HubSpot (read-only, no cost). Large pulls take a few minutes.' };
    case 'pull-hubspot-contacts':
      return { recipe, candidates: -1, unit: 'contacts', estCostUsd: 0, vendor: 'HubSpot', free: true,
        what: 'Imports all contacts from HubSpot (read-only, no cost). Run the company sync first.' };
    default: {
      const [{ n }] = await db.select({ n: count() }).from(contacts).where(sql`false`);
      return { recipe, candidates: n, unit: 'records', estCostUsd: 0, vendor: '—', what: 'No estimate available.' };
    }
  }
}
