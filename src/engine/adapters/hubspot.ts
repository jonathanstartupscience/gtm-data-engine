/**
 * HubSpot adapter — companies/contacts read+write, associations (v4), properties.
 * Ported from the ESO run's hubspot.py (incl. the v4 default-association fix).
 * Base https://api.hubapi.com · Authorization: Bearer · ~100 req/10s.
 */
import { config } from '../../lib/config.js';
import { request, requestJson, RateLimiter } from '../../lib/http.js';

const BASE = 'https://api.hubapi.com';
const limiter = new RateLimiter(100, 10_000);
const headers = () => ({ Authorization: `Bearer ${config.hubspotToken}`, 'Content-Type': 'application/json' });

export interface HsPage<T> { results: T[]; after?: string }

/** Live token test: hits a cheap endpoint and reports whether auth actually works. */
export async function testConnection(): Promise<{ ok: boolean; status: number; detail?: string }> {
  if (!config.hubspotToken) return { ok: false, status: 0, detail: 'No token set' };
  const r = await request(`${BASE}/crm/v3/objects/companies?limit=1`, { headers: headers(), limiter });
  if (r.ok) return { ok: true, status: r.status };
  const body = await r.text();
  let detail = `HTTP ${r.status}`;
  if (r.status === 401) detail = 'Token invalid or not authorized';
  else if (r.status === 403) detail = 'Token missing required scopes (CRM read/write)';
  return { ok: false, status: r.status, detail: detail + ': ' + body.slice(0, 80) };
}

/** Page through ALL companies (or contacts). Returns one page; pass `after` to continue. */
export async function listObjects(
  object: 'companies' | 'contacts',
  properties: string[],
  after?: string,
  limit = 100,
): Promise<HsPage<{ id: string; properties: Record<string, string> }>> {
  const params = new URLSearchParams({ limit: String(limit), properties: properties.join(',') });
  if (after) params.set('after', after);
  const j = await requestJson<{ results: { id: string; properties: Record<string, string> }[]; paging?: { next?: { after: string } } }>(
    `${BASE}/crm/v3/objects/${object}?${params}`, { headers: headers(), limiter });
  return { results: j.results ?? [], after: j.paging?.next?.after };
}

export async function searchCompanyByDomain(domain: string, properties = ['domain', 'name', 'type', 'sub_type']) {
  const body = {
    filterGroups: [{ filters: [{ propertyName: 'domain', operator: 'EQ', value: domain }] }],
    properties, limit: 1,
  };
  const j = await requestJson<{ results?: any[] }>(`${BASE}/crm/v3/objects/companies/search`, {
    method: 'POST', headers: headers(), limiter, body: JSON.stringify(body),
  });
  return j.results?.[0] ?? null;
}

export async function patchCompany(id: string, properties: Record<string, string>) {
  return requestJson(`${BASE}/crm/v3/objects/companies/${id}`, {
    method: 'PATCH', headers: headers(), limiter, body: JSON.stringify({ properties }),
  });
}

export async function createCompany(properties: Record<string, string>) {
  return requestJson<{ id: string }>(`${BASE}/crm/v3/objects/companies`, {
    method: 'POST', headers: headers(), limiter, body: JSON.stringify({ properties }),
  });
}

export async function searchContactByEmail(email: string) {
  const body = {
    filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email }] }],
    properties: ['email', 'hs_object_id'], limit: 1,
  };
  const j = await requestJson<{ results?: any[] }>(`${BASE}/crm/v3/objects/contacts/search`, {
    method: 'POST', headers: headers(), limiter, body: JSON.stringify(body),
  });
  return j.results?.[0] ?? null;
}

export async function createContact(properties: Record<string, string>): Promise<Response> {
  return request(`${BASE}/crm/v3/objects/contacts`, {
    method: 'POST', headers: headers(), limiter, body: JSON.stringify({ properties }),
  });
}

export async function patchContact(id: string, properties: Record<string, string>) {
  return requestJson(`${BASE}/crm/v3/objects/contacts/${id}`, {
    method: 'PATCH', headers: headers(), limiter, body: JSON.stringify({ properties }),
  });
}

/** v4 default association (the v3 path 400s — learned in the ESO run). */
export async function associateContactCompany(contactId: string, companyId: string) {
  return requestJson(
    `${BASE}/crm/v4/objects/contacts/${contactId}/associations/default/companies/${companyId}`,
    { method: 'PUT', headers: headers(), limiter },
  );
}

export async function getProperty(objectType: 'companies' | 'contacts', name: string) {
  const resp = await request(`${BASE}/crm/v3/properties/${objectType}/${name}`, { headers: headers(), limiter });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`getProperty ${resp.status}`);
  return resp.json();
}

export async function patchPropertyOptions(objectType: 'companies' | 'contacts', name: string, options: unknown[]) {
  return requestJson(`${BASE}/crm/v3/properties/${objectType}/${name}`, {
    method: 'PATCH', headers: headers(), limiter, body: JSON.stringify({ options }),
  });
}

export async function createProperty(objectType: 'companies' | 'contacts', payload: unknown): Promise<Response> {
  return request(`${BASE}/crm/v3/properties/${objectType}`, {
    method: 'POST', headers: headers(), limiter, body: JSON.stringify(payload),
  });
}
