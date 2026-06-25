import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

/**
 * Breadcrumb — a consistent "where am I" trail for detail pages (replaces the ad-hoc "← Back" links).
 * Pass the parent crumbs as {label, to}; the current page is the last, plain-text crumb.
 *
 *   <Breadcrumb trail={[{ label: 'Campaigns', to: '/campaigns' }]} current={campaign.name} />
 */
export function Breadcrumb({ trail, current }: { trail: { label: string; to: string }[]; current: ReactNode }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {trail.map((c) => (
        <span key={c.to}>
          <Link to={c.to}>{c.label}</Link>
          <span className="breadcrumb-sep" aria-hidden="true">/</span>
        </span>
      ))}
      <span className="breadcrumb-current" aria-current="page">{current}</span>
    </nav>
  );
}
