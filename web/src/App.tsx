import { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { HelpDrawer } from './components/HelpDrawer.js';
import { UserMenu } from './components/UserMenu.js';
import { SidebarNav } from './components/SidebarNav.js';
import { workspaceForPath } from './components/WorkspaceSwitcher.js';
import { useWorkspace } from './workspace.js';
import { api } from './api.js';

const nav = ({ isActive }: { isActive: boolean }) => 'navlink' + (isActive ? ' active' : '');

/** Persona-workspace picker for the Email Engine — selects which Bison workspace you're in,
 *  with a campaigns-status light underneath (green = sending, red = no active campaign). */
function EmailWorkspacePicker() {
  const { workspaces, active, activeSlug, setActive } = useWorkspace();
  if (!workspaces.length) return null;
  const sending = active?.sending ?? false;
  return (
    <div className="ws-sub">
      <label className="ws-sub-label">Workspace</label>
      <select className="ws-sub-select" value={activeSlug} onChange={(e) => setActive(e.target.value)}>
        {workspaces.map((w) => (
          <option key={w.slug} value={w.slug}>
            {w.name}{w.keyConfigured ? '' : ' — no key'}
          </option>
        ))}
      </select>
      {active && (
        <div className={'ws-status' + (sending ? ' sending' : '')}
          title={sending
            ? `${active.activeCampaigns} active campaign${active.activeCampaigns === 1 ? '' : 's'} sending`
            : 'No active campaigns — nothing sending'}>
          <span className="ws-status-dot" />
          {sending ? 'Active — sending' : 'Inactive — not sending'}
        </div>
      )}
    </div>
  );
}

export function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [replyBadge, setReplyBadge] = useState(0);
  const [liBadge, setLiBadge] = useState(0);
  const { pathname } = useLocation();
  const ws = workspaceForPath(pathname);
  const { activeSlug } = useWorkspace();

  // Poll unread positive replies for the Email + LinkedIn inbox nav badges.
  // Re-runs when the active Email workspace changes (the badge is workspace-scoped).
  useEffect(() => {
    let on = true;
    const tick = () => {
      api.inboxUnreadCount().then((d) => { if (on) setReplyBadge(d.count); }).catch(() => {});
      api.liInboxUnread().then((d) => { if (on) setLiBadge(d.count); }).catch(() => {});
    };
    tick();
    const t = setInterval(tick, 60_000);
    return () => { on = false; clearInterval(t); };
  }, [pathname, activeSlug]);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand-lockup"><img src="/brand/logo-white.svg" alt="Startup Science" /></div>

        <SidebarNav replyBadge={replyBadge} liBadge={liBadge} emailPicker={<EmailWorkspacePicker />} />

        {/* Global zone — system health + account-wide settings, pinned below the engines.
            HubSpot's connector detail page lives under Settings; keep it highlighted on those routes. */}
        <div className="nav-global">
          <NavLink to="/logs" className={nav}>Logs &amp; Health</NavLink>
          <NavLink
            to="/settings"
            className={() => 'navlink' + (pathname === '/settings' || pathname.startsWith('/connectors') || pathname === '/sync' ? ' active' : '')}
          >⚙ Settings</NavLink>
        </div>

        <div className="footer-actions">
          <NavLink to="/help" className={({ isActive }) => 'kb-btn' + (isActive ? ' active' : '')}>
            <span>📖</span> Knowledge Base
          </NavLink>
          <button className="help-btn" onClick={() => setHelpOpen(true)}>
            <span>?</span> Help for this page
          </button>
        </div>
        <UserMenu />
      </aside>
      <main className="main">
        {/* Remount Email-Engine pages when the workspace changes so they re-fetch scoped data.
            Other engines' routes are unaffected (their data isn't workspace-scoped). */}
        <Outlet key={ws.id === 'email' ? `email:${activeSlug}` : ws.id} />
      </main>
      {helpOpen && <HelpDrawer page={pathname} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
