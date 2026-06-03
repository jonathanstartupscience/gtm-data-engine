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
        <NavLink to="/runs" className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>Runs</NavLink>
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
