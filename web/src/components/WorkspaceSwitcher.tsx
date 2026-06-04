/**
 * Top-left workspace switcher — toggles between the two GTM workspaces:
 *   • GTM Data Engine  — the CRM / data warehouse (companies, contacts, hygiene, classify…)
 *   • GTM Outbound Engine — campaign orchestration (Email Bison cold email lives here)
 *
 * Each workspace owns a set of nav routes (see WORKSPACES). Switching navigates to the
 * workspace's home route; the sidebar then renders only that workspace's links.
 */
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export type WorkspaceId = 'data' | 'outbound';

export interface Workspace {
  id: WorkspaceId;
  name: string;
  tagline: string;
  home: string;
  /** Route prefixes that belong to this workspace (used to infer the active workspace). */
  routes: string[];
}

export const WORKSPACES: Workspace[] = [
  {
    id: 'data',
    name: 'GTM Data Engine',
    tagline: 'CRM & data warehouse',
    home: '/',
    routes: ['/', '/discover', '/find-contacts', '/import', '/companies', '/contacts',
      '/classify', '/hygiene', '/runs', '/connectors', '/sync', '/logs'],
  },
  {
    id: 'outbound',
    name: 'GTM Outbound Engine',
    tagline: 'Campaigns & cold email',
    home: '/outbound',
    routes: ['/outbound', '/campaigns'],
  },
];

/** Infer the active workspace from the current path (outbound routes win; default data). */
export function workspaceForPath(pathname: string): Workspace {
  const outbound = WORKSPACES[1];
  if (outbound.routes.some((r) => r === pathname || (r !== '/' && pathname.startsWith(r)))) return outbound;
  return WORKSPACES[0];
}

export function WorkspaceSwitcher({ active }: { active: Workspace }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div className="ws-switcher" ref={ref}>
      <button className="ws-current" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="ws-dot" data-ws={active.id} />
        <span className="ws-current-text">
          <span className="ws-name">{active.name}</span>
          <span className="ws-tagline">{active.tagline}</span>
        </span>
        <span className="ws-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="ws-menu" role="menu">
          <div className="ws-menu-label">Switch workspace</div>
          {WORKSPACES.map((w) => (
            <button
              key={w.id}
              className={'ws-option' + (w.id === active.id ? ' active' : '')}
              role="menuitem"
              onClick={() => { setOpen(false); navigate(w.home); }}
            >
              <span className="ws-dot" data-ws={w.id} />
              <span className="ws-current-text">
                <span className="ws-name">{w.name}</span>
                <span className="ws-tagline">{w.tagline}</span>
              </span>
              {w.id === active.id && <span className="ws-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
