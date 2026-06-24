import { useEffect, useState } from 'react';
import { api, type NotifyRoute } from '../api.js';
import { ChipInput } from './ChipInput.js';

/**
 * Reply routing — the round-robin roster of sales reps that reply alerts cycle through, plus the
 * Google Chat space they post to. The "This workspace" scope follows the ACTIVE Email-Engine
 * workspace (the api client appends ?workspace=<slug>), so callers that want to edit a specific
 * workspace's override must select that workspace first. Falls back to the global default when a
 * workspace has no roster of its own.
 *
 * `reloadKey` lets a parent force a reload (e.g. after switching the active workspace) without
 * remounting; bump it to re-fetch.
 */
export function ReplyRouting({ reloadKey, heading = true }: { reloadKey?: unknown; heading?: boolean }) {
  const [workspaceRoute, setWorkspaceRoute] = useState<NotifyRoute | null>(null);
  const [globalRoute, setGlobalRoute] = useState<NotifyRoute | null>(null);
  const [reps, setReps] = useState<string[]>([]);
  const [webhook, setWebhook] = useState('');
  const [scope, setScope] = useState<'workspace' | 'global'>('workspace');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  function load() {
    setLoading(true);
    api.notifyRoutes().then((d) => {
      setWorkspaceRoute(d.workspace); setGlobalRoute(d.global);
      const active = d.workspace ?? d.global;
      setReps(active?.reps ?? []);
      setWebhook(active?.webhookUrlOverride ?? '');
      setScope(d.workspace ? 'workspace' : 'global');
    }).finally(() => setLoading(false));
  }
  // Reload on mount and whenever the parent bumps reloadKey (active workspace changed).
  useEffect(load, [reloadKey]);

  function pick(next: 'workspace' | 'global') {
    setScope(next);
    const r = next === 'workspace' ? workspaceRoute : globalRoute;
    setReps(r?.reps ?? []);
    setWebhook(r?.webhookUrlOverride ?? '');
  }

  async function save() {
    setBusy(true); setMsg('');
    try {
      await api.saveNotifyRoute({ scope, reps, webhookUrlOverride: webhook.trim() || null });
      setMsg('Saved ✓'); load();
    } catch (e) { setMsg(String(e)); }
    setBusy(false);
  }

  return (
    <div style={{ marginTop: heading ? 28 : 0 }}>
      {heading && <h2 className="page-title" style={{ fontSize: 20 }}>Reply routing</h2>}
      {heading && (
        <p className="page-sub">
          When a prospect replies, we post an alert to Google Chat and tag the next rep in this roster
          (round-robin). Reps claim the reply in the Inbox and respond from there. Set the global default,
          or override it for this workspace.
        </p>
      )}
      {loading ? <div className="loading">Loading…</div> : (
        <div className="panel">
          <div className="toolbar" style={{ marginBottom: 12, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="radio" checked={scope === 'workspace'} onChange={() => pick('workspace')} /> This workspace
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="radio" checked={scope === 'global'} onChange={() => pick('global')} /> Global default
            </label>
          </div>

          <label className="muted" style={{ fontSize: 13 }}>Sales reps (round-robin order)</label>
          <ChipInput values={reps} onChange={setReps} placeholder="Add a rep's name and press Enter…" />

          <label className="muted" style={{ fontSize: 13, display: 'block', marginTop: 12 }}>
            Google Chat space URL (optional — overrides the default key for this scope)
          </label>
          <input className="input" type="url" placeholder="https://chat.googleapis.com/v1/spaces/…"
            value={webhook} onChange={(e) => setWebhook(e.target.value)} style={{ minWidth: 360, marginTop: 4 }} />

          <div className="toolbar" style={{ marginTop: 12, marginBottom: 0, alignItems: 'center' }}>
            <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save roster'}</button>
            {msg && <span className="muted">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
