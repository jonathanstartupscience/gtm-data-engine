/** Tiny typed fetch client for the engine API. */
export interface Stats {
  companies: number;
  contacts: number;
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
}

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json() as Promise<T>;
}

export const api = {
  stats: () => get<Stats>('/api/store/stats'),
  companies: (q: string, limit: number, offset: number) =>
    get<{ total: number; rows: Company[] }>(
      `/api/store/companies?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`),
  contacts: (q: string, persona: string, emailStatus: string, limit: number, offset: number) =>
    get<{ total: number; rows: Contact[] }>(
      `/api/store/contacts?q=${encodeURIComponent(q)}&persona=${encodeURIComponent(persona)}` +
      `&emailStatus=${encodeURIComponent(emailStatus)}&limit=${limit}&offset=${offset}`),
  company: (id: string) =>
    get<{ company: Company; contacts: Contact[] }>(`/api/store/companies/${id}`),
};
