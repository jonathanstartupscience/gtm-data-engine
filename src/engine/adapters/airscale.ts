/**
 * Airscale adapter — people discovery + email finding. Ported from the ESO run's
 * airscale.py. Base https://api.airscale.io/v1 · Authorization: Bearer · all POST.
 * Email finder is a slow multi-provider waterfall → 90s timeout + parallelize.
 */
import { config } from '../../lib/config.js';
import { request, requestJson, RateLimiter } from '../../lib/http.js';

const BASE = 'https://api.airscale.io/v1';
const limiter = new RateLimiter(2400, 60_000); // email finder allows ~3000/min
const headers = () => ({ Authorization: `Bearer ${config.airscaleKey}`, 'Content-Type': 'application/json' });

export interface AirscaleLead {
  firstname?: string;
  lastname?: string;
  jobTitle?: string;
  headline?: string;
  description?: string;
  profileUrl?: string;
  address?: string;
  companyName?: string;
  companyWebsite?: string;
  companyUrl?: string;
  companySize?: string;
  companyIndustry?: string;
}

/** Remaining credits (response nests under response.credits). */
export async function creditCount(): Promise<number> {
  const j = await requestJson<{ response?: { credits?: number }; credits?: number }>(
    `${BASE}/credits`, { method: 'POST', headers: headers(), limiter, body: '{}' },
  );
  return Number(j.response?.credits ?? j.credits ?? 0);
}

/** Find people at a domain matching any of the given titles. (Back-compat helper.) */
export async function findPeople(domain: string, titles: string[], size = 10): Promise<AirscaleLead[]> {
  const { leads } = await searchPeople({ companyDomain: { include: [domain] }, JobTitle: { include: titles } }, size);
  return leads;
}

/**
 * Full Airscale find-people query (verified against docs.airscale.io/api-reference/find-people).
 * Each field is an {include?, exclude?} string array (max 200 each), EXCEPT `keyword` (include-only,
 * searches title/bio/skills/education). At least one filter required.
 */
export interface PeopleQuery {
  firstname?: { include?: string[]; exclude?: string[] };
  lastname?: { include?: string[]; exclude?: string[] };
  JobTitle?: { include?: string[]; exclude?: string[] };
  companyDomain?: { include?: string[]; exclude?: string[] };
  companyLinkedinUrl?: { include?: string[]; exclude?: string[] };
  location?: { include?: string[]; exclude?: string[] };
  keyword?: { include?: string[] };
}

/** People search with the full query + cursor pagination. Returns {leads, total, nextCursor}. */
export async function searchPeople(query: PeopleQuery, size = 25, cursor?: string): Promise<{ leads: AirscaleLead[]; total: number; nextCursor: string | null }> {
  const body: Record<string, unknown> = { query, size: Math.min(Math.max(size, 1), 100) };
  if (cursor) body.cursor = cursor;
  const j = await requestJson<{ leads?: AirscaleLead[]; total?: number; next_cursor?: string | null }>(
    `${BASE}/find-people`, { method: 'POST', headers: headers(), limiter, body: JSON.stringify(body) },
  );
  return { leads: j.leads ?? [], total: j.total ?? (j.leads?.length ?? 0), nextCursor: j.next_cursor ?? null };
}

export interface EmailResult { email: string; email_status: string; status?: string }

/** Synchronous single email lookup (bulk is webhook-only — unusable locally). */
export async function findEmailSingle(input: {
  firstName?: string; lastName?: string; domain?: string;
  companyName?: string; linkedinUrl?: string;
}): Promise<EmailResult> {
  const body: Record<string, string> = {};
  if (input.firstName) body.first_name = input.firstName;
  if (input.lastName) body.last_name = input.lastName;
  if (input.domain) body.domain = input.domain;
  if (input.companyName) body.company_name = input.companyName;
  if (input.linkedinUrl) body.linkedin_profile_url = input.linkedinUrl;
  const resp = await request(`${BASE}/email`, {
    method: 'POST', headers: headers(), limiter, body: JSON.stringify(body), timeoutMs: 90_000,
  });
  if (!resp.ok) return { email: '', email_status: `error_${resp.status}` };
  const j = (await resp.json()) as EmailResult;
  return { email: j.email ?? '', email_status: j.email_status ?? j.status ?? 'not_found' };
}

/** Parallel email finding with a worker cap (waterfall is slow per-call). */
export async function findEmailsParallel(
  inputs: Parameters<typeof findEmailSingle>[0][],
  workers = 12,
  onProgress?: (done: number, total: number) => void,
): Promise<EmailResult[]> {
  const results: EmailResult[] = new Array(inputs.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < inputs.length) {
      const i = next++;
      try {
        results[i] = await findEmailSingle(inputs[i]);
      } catch {
        results[i] = { email: '', email_status: 'lookup_error' };
      }
      if (onProgress) onProgress(++done, inputs.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(workers, inputs.length) }, worker));
  return results;
}
