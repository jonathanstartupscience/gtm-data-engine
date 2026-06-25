import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { WORKSPACES, workspaceForPath } from './WorkspaceSwitcher.js';
import { useRecents } from '../recents.js';

/**
 * Unified sidebar — all three engines visible at once as collapsible sections, the one you're in
 * expanded by default. Replaces the old "one engine's nav at a time" model so the whole system is
 * always in view and "where does X live" is answered by scanning, not by remembering hidden state.
 *
 * Top level reads as ENGINE (Data / Email / LinkedIn — their actual names). The Email persona picker
 * keeps the name "Workspace" (it mirrors Email Bison's own term) and is nested visibly UNDER the Email
 * engine, so the two no longer collide. Routes are unchanged — this is structure + active-state color.
 */
interface NavItem { to: string; label: string; end?: boolean; badge?: number }
interface EngineNav { id: string; items: NavItem[]; extra?: ReactNode }

export function SidebarNav({ replyBadge, liBadge, emailPicker }: {
  replyBadge: number; liBadge: number; emailPicker: ReactNode;
}) {
  const { pathname } = useLocation();
  const recents = useRecents();
  const current = workspaceForPath(pathname).id;
  // Which engine sections are open. Default: only the current engine is expanded.
  const [open, setOpen] = useState<Record<string, boolean>>({ [current]: true });
  const isOpen = (id: string) => open[id] ?? id === current;

  const engines: EngineNav[] = [
    { id: 'data', items: [
      { to: '/', label: 'Dashboard', end: true },
      { to: '/discover', label: 'Find Companies' },
      { to: '/find-contacts', label: 'Find Contacts' },
      { to: '/discover-contacts', label: 'Discover Contacts' },
      { to: '/import', label: 'Import' },
      { to: '/companies', label: 'Companies' },
      { to: '/contacts', label: 'Contacts' },
      { to: '/classify', label: 'Classify' },
      { to: '/hygiene', label: 'Data Hygiene' },
      { to: '/runs', label: 'Workflows' },
    ] },
    { id: 'email', extra: emailPicker, items: [
      { to: '/performance', label: 'Performance' },
      { to: '/campaigns', label: 'Campaigns', end: true },
      { to: '/sequences', label: 'Sequences' },
      { to: '/experiments', label: 'Experiments' },
      { to: '/inbox', label: 'Inbox', badge: replyBadge },
      { to: '/email/workspaces', label: 'Workspaces' },
    ] },
    { id: 'linkedin', items: [
      { to: '/linkedin', label: 'Overview', end: true },
      { to: '/linkedin/campaigns', label: 'Campaigns' },
      { to: '/linkedin/inbox', label: 'Inbox', badge: liBadge },
    ] },
  ];

  return (
    <nav className="engine-nav">
      {recents.length > 0 && (
        <div className="recents">
          <div className="recents-hdr">Recent</div>
          {recents.map((r) => (
            <NavLink key={r.to} to={r.to} className={({ isActive }) => 'navlink recent-link' + (isActive ? ' active' : '')}>
              {r.label}
            </NavLink>
          ))}
        </div>
      )}
      {engines.map((e) => {
        const meta = WORKSPACES.find((w) => w.id === e.id)!;
        const expanded = isOpen(e.id);
        return (
          <div className={'engine-grp' + (expanded ? '' : ' collapsed')} key={e.id}>
            <button
              className={'engine-hdr' + (e.id === current ? ' current' : '')}
              data-ws={e.id}
              aria-expanded={expanded}
              onClick={() => setOpen((o) => ({ ...o, [e.id]: !isOpen(e.id) }))}
            >
              <span className="engine-dot" data-ws={e.id} />
              <span className="engine-hdr-name">{meta.name}</span>
              <span className="engine-caret">{expanded ? '▾' : '▸'}</span>
            </button>
            {expanded && (
              <div className="engine-items" data-ws={e.id}>
                {e.extra}
                {e.items.map((it) => (
                  <NavLink
                    key={it.to}
                    to={it.to}
                    end={it.end}
                    className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}
                  >
                    {it.label}
                    {it.badge ? <span className="nav-badge">{it.badge > 99 ? '99+' : it.badge}</span> : null}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
