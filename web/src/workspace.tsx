/**
 * Email-Engine workspace context. Mirrors Email Bison: one account, one workspace per persona,
 * each with its own API key. The active workspace is the top-level selector for the whole Email
 * Engine — every /api/outbound call is scoped to it (api.ts appends ?workspace=<slug>).
 *
 * Persisted in localStorage so the choice survives reloads. The sub-switcher in the Email Engine
 * header (see App.tsx) reads/sets it.
 */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api, setActiveWorkspace, type EmailWorkspace } from './api.js';

const STORAGE_KEY = 'gtm.emailWorkspace';

interface WorkspaceCtx {
  workspaces: EmailWorkspace[];
  active: EmailWorkspace | null;
  activeSlug: string;
  setActive: (slug: string) => void;
  loading: boolean;
  reload: () => void;
}

const Ctx = createContext<WorkspaceCtx | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<EmailWorkspace[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>(() => localStorage.getItem(STORAGE_KEY) || 'eso');
  const [loading, setLoading] = useState(true);

  // Keep the api client's workspace in sync from the very first render.
  setActiveWorkspace(activeSlug);

  const reload = useCallback(() => {
    setLoading(true);
    api.outboundWorkspaces()
      .then((r) => {
        setWorkspaces(r.workspaces);
        // If the stored slug isn't a real (active) workspace, fall back to the first active one.
        const ok = r.workspaces.some((w) => w.slug === activeSlug && w.active);
        if (!ok) {
          const first = r.workspaces.find((w) => w.active) ?? r.workspaces[0];
          if (first) { setActiveSlug(first.slug); setActiveWorkspace(first.slug); }
        }
      })
      .catch(() => { /* leave defaults; Email Engine pages still render */ })
      .finally(() => setLoading(false));
  }, [activeSlug]);

  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const setActive = useCallback((slug: string) => {
    setActiveSlug(slug);
    setActiveWorkspace(slug);
    localStorage.setItem(STORAGE_KEY, slug);
  }, []);

  const active = workspaces.find((w) => w.slug === activeSlug) ?? null;

  return (
    <Ctx.Provider value={{ workspaces, active, activeSlug, setActive, loading, reload }}>
      {children}
    </Ctx.Provider>
  );
}

export function useWorkspace(): WorkspaceCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return v;
}
