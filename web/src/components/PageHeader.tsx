import type { ReactNode } from 'react';

/**
 * PageHeader — the consistent top of every page: title, one-line purpose, and (optionally) the
 * page's single PRIMARY action on the right. This is the clarity template — one obvious next action
 * per page, everything secondary lives in the page body. Mirrors the structure used across Linear/
 * Slack: a calm header that tells you where you are and what the main thing to do is.
 *
 *   <PageHeader title="Campaigns" sub="…" action={<Link className="btn btn-primary">New campaign</Link>} />
 */
export function PageHeader({ title, sub, action }: { title: ReactNode; sub?: ReactNode; action?: ReactNode }) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub mb-0">{sub}</p>}
      </div>
      {action && <div className="page-header-action">{action}</div>}
    </div>
  );
}

/**
 * EmptyState — a calm "nothing here yet" with the one action that fixes it, instead of a bare line of
 * text. Use inside a panel for first-run / no-results states.
 */
export function EmptyState({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-state-title">{title}</div>
      {hint && <p className="muted text-sm mt-1 mb-0">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
