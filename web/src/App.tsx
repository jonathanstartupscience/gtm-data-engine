import { NavLink, Outlet } from 'react-router-dom';

export function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">GTM<span>·</span>Engine</div>
        <NavLink to="/" end className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>
          Dashboard
        </NavLink>
        <NavLink to="/companies" className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>
          Companies
        </NavLink>
        <NavLink to="/contacts" className={({ isActive }) => 'navlink' + (isActive ? ' active' : '')}>
          Contacts
        </NavLink>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
