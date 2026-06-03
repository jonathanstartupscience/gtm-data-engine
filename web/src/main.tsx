import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ClerkProvider, SignedIn, SignedOut, SignIn, useAuth } from '@clerk/clerk-react';
import { App } from './App.js';
import { Dashboard } from './pages/Dashboard.js';
import { Companies } from './pages/Companies.js';
import { Contacts } from './pages/Contacts.js';
import { CompanyDetail } from './pages/CompanyDetail.js';
import { Runs } from './pages/Runs.js';
import { Import } from './pages/Import.js';
import { Discover } from './pages/Discover.js';
import { setTokenGetter } from './api.js';
import './styles.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'companies', element: <Companies /> },
      { path: 'companies/:id', element: <CompanyDetail /> },
      { path: 'contacts', element: <Contacts /> },
      { path: 'runs', element: <Runs /> },
      { path: 'import', element: <Import /> },
      { path: 'discover', element: <Discover /> },
    ],
  },
]);

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

const brandAppearance = {
  variables: { colorPrimary: '#4d4d9d', borderRadius: '8px', fontFamily: '"DM Sans", sans-serif' },
};

/** Bridges Clerk's getToken into the api client so requests carry the session. */
function TokenBridge() {
  const { getToken } = useAuth();
  setTokenGetter(() => getToken());
  return null;
}

function AuthedApp() {
  return (
    <>
      <TokenBridge />
      <RouterProvider router={router} />
    </>
  );
}

function SignInScreen() {
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <img src="/brand/logo-white.svg" alt="Startup Science" />
        <SignIn appearance={brandAppearance} />
      </div>
    </div>
  );
}

function ConfigError() {
  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: 420 }}>
        <img src="/brand/logo-white.svg" alt="Startup Science" />
        <p style={{ color: '#f7f6f2' }}>
          Login is enabled on the server, but the front-end is missing its Clerk key.
          Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> in Railway and redeploy.
        </p>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);

if (PUBLISHABLE_KEY) {
  // Clerk configured at build → gate the app behind sign-in.
  root.render(
    <React.StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY} appearance={brandAppearance}>
        <SignedIn><AuthedApp /></SignedIn>
        <SignedOut><SignInScreen /></SignedOut>
      </ClerkProvider>
    </React.StrictMode>,
  );
} else {
  // No build-time Clerk key. Check whether the SERVER expects auth — if so, the
  // VITE var didn't bake in; show a clear fix message instead of silently failing.
  fetch('/api/config')
    .then((r) => r.json())
    .then((cfg: { authRequired?: boolean }) => {
      root.render(
        <React.StrictMode>
          {cfg.authRequired ? <ConfigError /> : <RouterProvider router={router} />}
        </React.StrictMode>,
      );
    })
    .catch(() => {
      root.render(<React.StrictMode><RouterProvider router={router} /></React.StrictMode>);
    });
}
