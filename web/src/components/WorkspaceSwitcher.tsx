/**
 * Workspace (engine) model — the source of truth for the three engines and route→engine inference.
 * The unified sidebar (SidebarNav) renders all three at once; this module just describes them.
 * "Engine" is the top level (Data / Email / LinkedIn). Naming note: the Email persona picker keeps
 * the term "Workspace" because it mirrors Email Bison's own vocabulary.
 */
export type WorkspaceId = 'data' | 'email' | 'linkedin';

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
    name: 'Data Engine',
    tagline: 'CRM & data warehouse',
    home: '/',
    routes: ['/', '/discover', '/find-contacts', '/discover-contacts', '/import', '/companies', '/contacts',
      '/classify', '/hygiene', '/runs', '/connectors', '/sync', '/logs', '/help', '/help/'],
  },
  {
    id: 'email',
    name: 'Email Engine',
    tagline: 'Cold email · Email Bison',
    home: '/performance',
    routes: ['/performance', '/campaigns', '/sequences', '/experiments', '/inbox', '/email/workspaces'],
  },
  {
    id: 'linkedin',
    name: 'LinkedIn Engine',
    tagline: 'LinkedIn outreach · HeyReach',
    home: '/linkedin',
    routes: ['/linkedin', '/linkedin/campaigns', '/linkedin/inbox'],
  },
];

// Global, workspace-independent pages (settings, system health, connector detail). They don't belong
// to any one engine — visiting them keeps you in the Data shell by default, and the global nav zone
// (Logs & Health · Settings) is rendered in every workspace regardless.

/** Infer the active workspace from the current path. Most-specific (LinkedIn, then Email) wins; default Data. */
export function workspaceForPath(pathname: string): Workspace {
  const match = (w: Workspace) => w.routes.some((r) => r === pathname || (r !== '/' && pathname.startsWith(r)));
  return WORKSPACES.find((w) => w.id !== 'data' && match(w)) ?? WORKSPACES[0];
}
