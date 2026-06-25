import { useSyncExternalStore } from 'react';

/**
 * Recents — a tiny localStorage-backed list of recently-visited detail pages (campaigns, sequences,
 * experiments, companies…), surfaced at the top of the sidebar so frequent items don't require
 * scrolling a list. Detail pages call recordRecent() on mount; the sidebar reads useRecents().
 */
export interface Recent { to: string; label: string; kind: string }

const KEY = 'gtm.recents.v1';
const MAX = 6;
const listeners = new Set<() => void>();

function read(): Recent[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Recent[]; } catch { return []; }
}

/** Record a visit. Most-recent first, deduped by `to`, capped at MAX. Skips empty labels. */
export function recordRecent(r: Recent): void {
  if (!r.to || !r.label?.trim()) return;
  const next = [r, ...read().filter((x) => x.to !== r.to)].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // Cross-tab: another tab writing the key fires 'storage'.
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(cb); window.removeEventListener('storage', onStorage); };
}

const EMPTY: Recent[] = [];
let cache: Recent[] = read();
function getSnapshot(): Recent[] {
  // useSyncExternalStore requires a stable reference when unchanged; re-read + compare cheaply.
  const fresh = read();
  if (fresh.length !== cache.length || fresh.some((r, i) => r.to !== cache[i]?.to)) cache = fresh;
  return cache;
}

/** Reactive recents for the sidebar. Returns most-recent-first. */
export function useRecents(): Recent[] {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
