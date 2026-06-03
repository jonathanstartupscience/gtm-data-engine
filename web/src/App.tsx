import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { HelpDrawer } from './components/HelpDrawer.js';
import { UserMenu } from './components/UserMenu.js';

export function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand-lockup">
          <img src="/brand/logo-white.svg" alt="Startup Science" />
          <div className="brand-eyebrow">GTM Data Engine</div>
        </div>
        <NavLink to="/" end className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>Dashboard</NavLink>
        <NavLink to="/discover" className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>Find Companies</NavLink>
        <NavLink to="/import" className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>Import</NavLink>
        <NavLink to="/companies" className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>Companies</NavLink>
        <NavLink to="/contacts" className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>Contacts</NavLink>
        <NavLink to="/runs" className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>Workflows</NavLink>
        <NavLink to="/connectors" className={() => 'navlink' + (pathname.startsWith('/connectors') || pathname === '/campaigns' || pathname === '/sync' ? ' active' : '')}>Connectors</NavLink>
        {(pathname.startsWith('/connectors') || pathname === '/campaigns' || pathname === '/sync') && (
          <div style={{ marginLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: 6 }}>
            <NavLink to="/connectors/hubspot" className={({ isActive }) => 'navlink' + (isActive || pathname === '/sync' ? ' active' : '')}>HubSpot</NavLink>
            <NavLink to="/campaigns" className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>Email Bison</NavLink>
          </div>
        )}
        <NavLink to="/logs" className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>Logs &amp; Health</NavLink>
        <button className="help-btn" onClick={() => setHelpOpen(true)}>
          <span>?</span> Help &amp; how it works
        </button>
        <UserMenu />
      </aside>
      <main className="main">
        <Outlet />
      </main>
      {helpOpen && <HelpDrawer page={pathname} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
