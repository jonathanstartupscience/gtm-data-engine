/** Shared table helpers: sortable column header + clickable domain link. */

export function SortHeader({ label, col, sort, dir, onSort }:
  { label: string; col: string; sort: string; dir: string; onSort: (c: string) => void }) {
  const active = sort === col;
  return (
    <th onClick={() => onSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
      {label} <span style={{ opacity: active ? 1 : 0.25 }}>{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
    </th>
  );
}

/** Render a domain as a link that opens the website in a new tab. */
export function DomainLink({ domain }: { domain: string | null | undefined }) {
  if (!domain) return <span className="muted">—</span>;
  const href = /^https?:\/\//.test(domain) ? domain : `https://${domain}`;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
      {domain.replace(/^https?:\/\//, '')}
    </a>
  );
}

/** Human-friendly labels for email-status codes (shown to end users, not raw codes). */
export const EMAIL_STATUS_LABELS: Record<string, string> = {
  deliverable: 'Deliverable',
  risky_catchall: 'Risky (catch-all)',
  role_based: 'Role-based (info@)',
  undeliverable: 'Undeliverable',
  risky: 'Risky',
  unknown: 'Unknown',
  no_email: 'No email found',
  unverified: 'Not yet verified',
};
export const emailStatusLabel = (s: string | null | undefined): string =>
  (s ? (EMAIL_STATUS_LABELS[s] ?? s) : '');

/** Hook-free sort state helper: toggles dir when same col clicked, else asc on new col. */
export function nextSort(current: { sort: string; dir: string }, col: string): { sort: string; dir: string } {
  if (current.sort === col) return { sort: col, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { sort: col, dir: 'asc' };
}
