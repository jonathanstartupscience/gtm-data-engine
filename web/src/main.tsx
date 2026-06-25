import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom';
import { ClerkProvider, SignedIn, SignedOut, SignIn, useAuth } from '@clerk/clerk-react';
import { App } from './App.js';
import { setTokenGetter } from './api.js';
import { WorkspaceProvider } from './workspace.js';
import './styles.css';

// Page components are lazy-loaded so each route is its own chunk and the initial
// bundle stays small. Named exports → remap to a default for React.lazy().
const Dashboard = lazy(() => import('./pages/Dashboard.js').then((m) => ({ default: m.Dashboard })));
const Companies = lazy(() => import('./pages/Companies.js').then((m) => ({ default: m.Companies })));
const Contacts = lazy(() => import('./pages/Contacts.js').then((m) => ({ default: m.Contacts })));
const CompanyDetail = lazy(() => import('./pages/CompanyDetail.js').then((m) => ({ default: m.CompanyDetail })));
const Runs = lazy(() => import('./pages/Runs.js').then((m) => ({ default: m.Runs })));
const Import = lazy(() => import('./pages/Import.js').then((m) => ({ default: m.Import })));
const Discover = lazy(() => import('./pages/Discover.js').then((m) => ({ default: m.Discover })));
const FindContacts = lazy(() => import('./pages/FindContacts.js').then((m) => ({ default: m.FindContacts })));
const DiscoverContacts = lazy(() => import('./pages/DiscoverContacts.js').then((m) => ({ default: m.DiscoverContacts })));
const Logs = lazy(() => import('./pages/Logs.js').then((m) => ({ default: m.Logs })));
const Sync = lazy(() => import('./pages/Sync.js').then((m) => ({ default: m.Sync })));
const Campaigns = lazy(() => import('./pages/Campaigns.js').then((m) => ({ default: m.Campaigns })));
const CampaignBuilder = lazy(() => import('./pages/CampaignBuilder.js').then((m) => ({ default: m.CampaignBuilder })));
const CampaignDetail = lazy(() => import('./pages/CampaignDetail.js').then((m) => ({ default: m.CampaignDetail })));
const Sequences = lazy(() => import('./pages/Sequences.js').then((m) => ({ default: m.Sequences })));
const SequenceBuilder = lazy(() => import('./pages/SequenceBuilder.js').then((m) => ({ default: m.SequenceBuilder })));
const Experiments = lazy(() => import('./pages/Experiments.js').then((m) => ({ default: m.Experiments })));
const ExperimentDetail = lazy(() => import('./pages/ExperimentDetail.js').then((m) => ({ default: m.ExperimentDetail })));
const Inbox = lazy(() => import('./pages/Inbox.js').then((m) => ({ default: m.Inbox })));
const Performance = lazy(() => import('./pages/Performance.js').then((m) => ({ default: m.Performance })));
const Workspaces = lazy(() => import('./pages/Workspaces.js').then((m) => ({ default: m.Workspaces })));
const LinkedInOverview = lazy(() => import('./pages/LinkedInOverview.js').then((m) => ({ default: m.LinkedInOverview })));
const LinkedInCampaigns = lazy(() => import('./pages/LinkedInCampaigns.js').then((m) => ({ default: m.LinkedInCampaigns })));
const LinkedInInbox = lazy(() => import('./pages/LinkedInInbox.js').then((m) => ({ default: m.LinkedInInbox })));
const Settings = lazy(() => import('./pages/Settings.js').then((m) => ({ default: m.Settings })));
const Help = lazy(() => import('./pages/Help.js').then((m) => ({ default: m.Help })));
const HelpArticle = lazy(() => import('./pages/HelpArticle.js').then((m) => ({ default: m.HelpArticle })));
const HubspotConnector = lazy(() => import('./pages/HubspotConnector.js').then((m) => ({ default: m.HubspotConnector })));
const Classify = lazy(() => import('./pages/Classify.js').then((m) => ({ default: m.Classify })));
const Hygiene = lazy(() => import('./pages/Hygiene.js').then((m) => ({ default: m.Hygiene })));

/** Wraps a lazy page in Suspense so its chunk can stream in without blanking the shell. */
const page = (el: React.ReactNode) => (
  <Suspense fallback={<div className="loading">Loading…</div>}>{el}</Suspense>
);

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: page(<Dashboard />) },
      { path: 'companies', element: page(<Companies />) },
      { path: 'companies/:id', element: page(<CompanyDetail />) },
      { path: 'contacts', element: page(<Contacts />) },
      { path: 'runs', element: page(<Runs />) },
      { path: 'import', element: page(<Import />) },
      { path: 'discover', element: page(<Discover />) },
      { path: 'find-contacts', element: page(<FindContacts />) },
      { path: 'discover-contacts', element: page(<DiscoverContacts />) },
      { path: 'logs', element: page(<Logs />) },
      { path: 'sync', element: page(<Sync />) },
      { path: 'campaigns', element: page(<Campaigns />) },
      { path: 'campaigns/new', element: page(<CampaignBuilder />) },
      { path: 'campaigns/:id', element: page(<CampaignDetail />) },
      { path: 'sequences', element: page(<Sequences />) },
      { path: 'sequences/new', element: page(<SequenceBuilder />) },
      { path: 'sequences/:id', element: page(<SequenceBuilder />) },
      { path: 'experiments', element: page(<Experiments />) },
      { path: 'experiments/:id', element: page(<ExperimentDetail />) },
      { path: 'inbox', element: page(<Inbox />) },
      { path: 'performance', element: page(<Performance />) },
      { path: 'email/workspaces', element: page(<Workspaces />) },
      { path: 'linkedin', element: page(<LinkedInOverview />) },
      { path: 'linkedin/campaigns', element: page(<LinkedInCampaigns />) },
      { path: 'linkedin/inbox', element: page(<LinkedInInbox />) },
      { path: 'settings', element: page(<Settings />) },
      { path: 'help', element: page(<Help />) },
      { path: 'help/:slug', element: page(<HelpArticle />) },
      { path: 'connectors', element: <Navigate to="/settings" replace /> }, // merged into global Settings
      { path: 'connectors/hubspot', element: page(<HubspotConnector />) },
      { path: 'classify', element: page(<Classify />) },
      { path: 'hygiene', element: page(<Hygiene />) },
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
      <WorkspaceProvider>
        <RouterProvider router={router} />
      </WorkspaceProvider>
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
          {cfg.authRequired ? <ConfigError /> : (
            <WorkspaceProvider><RouterProvider router={router} /></WorkspaceProvider>
          )}
        </React.StrictMode>,
      );
    })
    .catch(() => {
      root.render(
        <React.StrictMode>
          <WorkspaceProvider><RouterProvider router={router} /></WorkspaceProvider>
        </React.StrictMode>,
      );
    });
}
