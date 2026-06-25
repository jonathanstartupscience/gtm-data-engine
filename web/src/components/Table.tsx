/** Shared table helpers: sortable column header + clickable domain link. */

export function SortHeader({ label, col, sort, dir, onSort }:
  { label: string; col: string; sort: string; dir: string; onSort: (c: string) => void }) {
  const active = sort === col;
  // A real <button> inside the th: focusable + Enter/Space for free, with aria-sort on the cell so
  // screen readers announce the current sort direction.
  return (
    <th aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={active ? 'sorted' : undefined} style={{ whiteSpace: 'nowrap' }}>
      <button type="button" className="sort-header" onClick={() => onSort(col)}
        aria-label={`Sort by ${label}${active ? (dir === 'asc' ? ', ascending' : ', descending') : ''}`}>
        {label} <span aria-hidden="true" style={{ opacity: active ? 0.8 : 0.25, fontSize: '0.8em' }}>{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
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
