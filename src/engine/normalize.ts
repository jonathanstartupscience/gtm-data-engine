/**
 * Normalization + identity-resolution keys. Ported from the ESO dedup logic.
 * These produce the stable keys the canonical store resolves on.
 */

/** Lowercase, strip protocol/www, trailing slash. */
export function normDomain(input: string | null | undefined): string {
  if (!input) return '';
  let d = input.trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '');
  d = d.split('/')[0];
  return d;
}

export function normEmail(input: string | null | undefined): string {
  return (input ?? '').trim().toLowerCase();
}

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const isValidEmail = (e: string | null | undefined) => EMAIL_RE.test((e ?? '').trim());

/** Normalize a LinkedIn URL to a comparable key. */
export function normLinkedin(input: string | null | undefined): string {
  let s = (input ?? '').trim().toLowerCase().replace(/\/+$/, '');
  s = s.replace(/^https?:\/\/(www\.)?/, '');
  return s;
}

/** Letters-only name key, joined with the domain — the contact name+domain match key. */
export function nameDomainKey(first: string, last: string, domain: string): string {
  const n = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const nm = n(first) + n(last);
  if (!nm) return '';
  return `${nm}|${normDomain(domain)}`;
}

/** Company name key for fuzzy-ish exact matching (letters+digits, lowercased). */
export function companyNameKey(name: string | null | undefined): string {
  return (name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Stable hash of a record's values for raw_records.row_hash (dedup of re-ingests). */
export async function rowHash(values: (string | null | undefined)[]): Promise<string> {
  const joined = values.map((v) => (v ?? '').toString().trim()).join('|');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(joined));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
