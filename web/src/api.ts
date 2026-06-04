/** Tiny typed fetch client for the engine API. */
export interface Stats {
  companies: number;
  contacts: number;
  byType: { key: string; n: number }[];
  bySubType: { key: string; n: number }[];
  byPersona: { key: string; n: number }[];
  byEmailStatus: { key: string; n: number }[];
}

export interface Company {
  id: number; name: string | null; domain: string | null; website: string | null;
  type: string | null; subType: string | null; country: string | null; state: string | null;
  city: string | null; linkedinUrl: string | null; foundedYear: string | null;
  sizeEmployees: string | null; sector: string | null; hubspotId: string | null;
}

export interface Contact {
  id: number; firstName: string | null; lastName: string | null; email: string | null;
  jobTitle: string | null; persona: string | null; linkedinUrl: string | null;
  emailStatus: string | null; hubspotId: string | null;
  companyName?: string | null; companyDomain?: string | null;
  companyWebsite?: string | null; companyLinkedin?: string | null;
}

/** Set by the app once Clerk is ready; returns a session token or null. */
let tokenGetter: (() => Promise<string | null>) | null = null;
export function setTokenGetter(fn: () => Promise<string | null>) { tokenGetter = fn; }

/** A session token for SSE/EventSource URLs (which can't send headers). */
export async function authToken(): Promise<string | null> {
  return tokenGetter ? tokenGetter() : null;
}

async function get<T>(url: string): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenGetter ? await tokenGetter() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json() as Promise<T>;
}

export const api = {
  stats: () => get<Stats>('/api/store/stats'),
  companies: (p: { q: string; type: string; subType: string; country: string; sort: string; dir: string; limit: number; offset: number }) =>
    get<{ total: number; rows: Company[] }>(
      `/api/store/companies?${new URLSearchParams({ q: p.q, type: p.type, subType: p.subType, country: p.country, sort: p.sort, dir: p.dir, limit: String(p.limit), offset: String(p.offset) })}`),
  companyFacets: () =>
    get<{ subTypes: { v: string; n: number }[]; countries: { v: string; n: number }[] }>(
      '/api/store/companies/facets'),
  contacts: (p: { q: string; persona: string; emailStatus: string; sort: string; dir: string; limit: number; offset: number }) =>
    get<{ total: number; rows: Contact[] }>(
      `/api/store/contacts?${new URLSearchParams({ q: p.q, persona: p.persona, emailStatus: p.emailStatus, sort: p.sort, dir: p.dir, limit: String(p.limit), offset: String(p.offset) })}`),
  company: (id: string) =>
    get<{ company: Company; contacts: Contact[] }>(`/api/store/companies/${id}`),
  runs: () => get<{ rows: Run[] }>('/api/runs'),
  run: (id: number) => get<{ run: Run }>(`/api/runs/${id}`),
  logs: () => get<{ events: LogEvent[]; integrations: Record<string, boolean> }>('/api/logs'),
  pushPreview: (limit: number) => post<PushPreview>('/api/push/preview', { limit }),
  importPreview: (csv: string, entityType: string) =>
    post<ImportPreview>('/api/import/preview', { csv, entityType }),
  taxonomy: () => get<{ types: TaxonomyType[] }>('/api/taxonomy'),
  seeds: (type: string, subType: string) =>
    get<{ seeds: { domain: string; name: string }[] }>(
      `/api/discover/seeds?type=${encodeURIComponent(type)}&subType=${encodeURIComponent(subType)}`),
  bisonCampaigns: () => get<{ campaigns: { id: number; name: string; status?: string }[] }>('/api/bison/campaigns'),
  bisonSegmentCount: (persona: string, subType: string) =>
    get<{ count: number }>(`/api/bison/segment-count?persona=${encodeURIComponent(persona)}&subType=${encodeURIComponent(subType)}`),
  scope: (recipe: string) => get<Scope>(`/api/runs/scope/${recipe}`),
  findContactsScope: (persona: string, subType: string) =>
    get<{ candidates: number; estPeople: number; estCostUsd: number; vendor: string; what: string }>(
      `/api/discover/find-contacts/scope?persona=${encodeURIComponent(persona)}&subType=${encodeURIComponent(subType)}`),
  connectors: () => get<{ connectors: Connector[] }>('/api/connectors'),
  hubspotSync: () => get<HubspotSync>('/api/connectors/hubspot'),
  classifyAudit: () => get<{ missingTaxonomy: number; pendingProposals: number }>('/api/classify/audit'),
  classifyProposals: (minConfidence: number) => get<{ proposals: Proposal[] }>(`/api/classify/proposals?minConfidence=${minConfidence}`),
  classifyDecide: (approve: number[], reject: number[]) => post<{ applied: number; rejected: number }>('/api/classify/decide', { approve, reject }),
};

export interface Proposal {
  id: number; companyId: number; type: string | null; subType: string | null;
  confidence: number | null; reason: string | null; signal: string | null;
  name: string | null; domain: string | null; currentType: string | null; currentSubType: string | null;
}

export interface Scope {
  recipe: string; candidates: number; unit: string; estCostUsd: number;
  vendor: string; what: string; free?: boolean;
}
export interface Connector { id: string; name: string; role: string; connected: boolean }
export interface HubspotSync {
  connected: boolean;
  tokenValid?: boolean;
  tokenDetail?: string;
  tokenFingerprint?: { prefix: string; len: number; last4: string; hasWhitespace: boolean } | null;
  companies: { total: number; synced: number; coverage: number };
  contacts: { total: number; synced: number; coverage: number };
  lastSync: { pullCompanies: string | null; pullContacts: string | null; push: string | null };
}

export interface TaxonomyType {
  value: string; label: string; count: number;
  subTypes: { value: string; count: number }[];
}

export interface LogEvent {
  id: number; kind: string; status: string;
  level: 'error' | 'warn' | 'info'; message: string; at: string;
}

export interface FieldChange { field: string; from: string; to: string }
export interface CompanyChange {
  storeId: number; name: string; domain: string; action: 'create' | 'update';
  hubspotId?: string; changes: FieldChange[];
}
export interface PushPreview {
  total: number; toCreate: number; toUpdate: number; unchanged: number;
  changes: CompanyChange[]; truncated: boolean;
}

export interface ImportPreview {
  headers: string[]; total: number; sample: Record<string, string>[];
  fields: string[]; mapping: Record<string, string>;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenGetter ? await tokenGetter() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json() as Promise<T>;
}

/** Download an auth-protected URL as a file (adds the Clerk token, triggers browser save). */
export async function downloadCsv(url: string, filename: string): Promise<void> {
  const headers: Record<string, string> = {};
  const token = tokenGetter ? await tokenGetter() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/** POST a body and stream back SSE-style events (event/data lines). Calls onEvent per event. */
export async function postStream(
  url: string,
  body: unknown,
  onEvent: (event: string, data: unknown) => void,
): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = tokenGetter ? await tokenGetter() : null;
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!resp.body) throw new Error('no stream');
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const chunks = buf.split('\n\n');
    buf = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const ev = chunk.match(/event: (.*)/)?.[1] ?? 'message';
      const dataLine = chunk.match(/data: (.*)/)?.[1];
      if (dataLine) onEvent(ev, JSON.parse(dataLine));
    }
  }
}

export interface Run {
  id: number; kind: string; status: string;
  stats: Record<string, unknown> | null;
  startedAt: string; finishedAt: string | null;
}
