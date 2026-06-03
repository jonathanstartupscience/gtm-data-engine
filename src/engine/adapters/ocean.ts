/**
 * Ocean.io adapter — account discovery (lookalikes + ICP filter) and company enrich.
 * Verified against docs + live key (see VENDOR_API_REFERENCE.md).
 * Base https://api.ocean.io  ·  auth header x-api-token  ·  60 req/min default.
 *
 * Live-verified notes: pagination `from` is 1-indexed (>=1). Lookalike SEARCH is
 * plan-gated (current tier returns 400 "Plan version not supported"); ENRICH works
 * and its body is wrapped: {company:{domain}}.
 */
import { config } from '../../lib/config.js';
import { request, requestJson, RateLimiter } from '../../lib/http.js';

const BASE = 'https://api.ocean.io';
const limiter = new RateLimiter(50, 60_000); // stay under 60/min
const headers = () => ({ 'x-api-token': config.oceanKey, 'Content-Type': 'application/json' });

export interface OceanCompany {
  name?: string;
  rootUrl?: string; // domain in search responses
  domain?: string; // domain in enrich responses
  description?: string;
  companySize?: string;
  revenue?: string;
  yearFounded?: string;
  industries?: string[];
  primaryCountry?: string;
  technologies?: string[];
  [k: string]: unknown;
}

/** Credit/usage balance. Cheap, good as a preflight. */
export async function creditBalance(): Promise<{
  credits: { oneTime: number; recurrent: number };
  dailyLimitRateLeft: number;
}> {
  return requestJson(`${BASE}/v2/credits/balance`, { headers: headers(), limiter });
}

/**
 * Find lookalike companies for seed domains (or pure ICP filter if no seeds).
 * Returns the companies array. `domainOf()` normalizes the domain field difference.
 */
export async function searchCompanies(opts: {
  lookalikeDomains?: string[];
  minScore?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  filters?: Record<string, unknown>;
  size?: number;
  from?: number;
  searchAfter?: string;
}): Promise<{ companies: OceanCompany[]; raw: unknown }> {
  const companiesFilters: Record<string, unknown> = { ...(opts.filters ?? {}) };
  if (opts.lookalikeDomains?.length) companiesFilters.lookalikeDomains = opts.lookalikeDomains;
  if (opts.minScore != null) companiesFilters.minScore = opts.minScore;
  if (opts.includeDomains?.length) companiesFilters.includeDomains = opts.includeDomains;
  if (opts.excludeDomains?.length) companiesFilters.excludeDomains = opts.excludeDomains;

  const body = {
    size: opts.size ?? 25,
    from: opts.from ?? 1, // Ocean pagination is 1-indexed (from >= 1), confirmed via live 422
    ...(opts.searchAfter ? { searchAfter: opts.searchAfter } : {}),
    companiesFilters,
  };
  const resp = await request(`${BASE}/v2/search/companies`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body), limiter,
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Ocean search ${resp.status}: ${text.slice(0, 300)}`);
  const json = text ? JSON.parse(text) : {};
  return { companies: json.companies ?? [], raw: json };
}

/**
 * Enrich a company by domain (1 credit WITH domain, 5 without — always pass domain).
 * Body is wrapped: {company:{domain}} (confirmed via live call; docs showed it flat).
 */
export async function enrichCompany(domain: string, fields?: string[]): Promise<OceanCompany> {
  const company: Record<string, unknown> = { domain };
  const body: Record<string, unknown> = { company };
  if (fields?.length) body.fields = fields;
  return requestJson(`${BASE}/v2/enrich/company`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body), limiter,
  });
}

/** Normalize the domain field (search uses rootUrl, enrich uses domain). */
export const domainOf = (c: OceanCompany): string =>
  (c.domain ?? c.rootUrl ?? '').toString().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
