import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { ChipInput } from './ChipInput.js';

/**
 * Reply routing for ONE workspace — the round-robin roster of sales reps that reply alerts cycle
 * through, plus the Google Chat space they post to. Scoped to the ACTIVE Email-Engine workspace (the
 * api client appends ?workspace=<slug>), so the caller must select the workspace first. There is no
 * global roster — each workspace owns its own. If a workspace sets no Chat space here, alerts post to
 * the shared default space (GOOGLE_CHAT_WEBHOOK_URL, managed on Settings).
 *
 * `reloadKey` lets a parent force a reload (e.g. after switching the active workspace) without
 * remounting; bump it to re-fetch.
 */
export function ReplyRouting({ reloadKey }: { reloadKey?: unknown }) {
  const [reps, setReps] = useState<string[]>([]);
  const [webhook, setWebhook] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  function load() {
    setLoading(true);
    api.notifyRoutes().then((d) => {
      setReps(d.workspace?.reps ?? []);
      setWebhook(d.workspace?.webhookUrlOverride ?? '');
    }).finally(() => setLoading(false));
  }
  // Reload on mount and whenever the parent bumps reloadKey (active workspace changed).
  useEffect(load, [reloadKey]);

  async function save() {
    setBusy(true); setMsg('');
    try {
      await api.saveNotifyRoute({ scope: 'workspace', reps, webhookUrlOverride: webhook.trim() || null });
      setMsg('Saved ✓'); load();
    } catch (e) { setMsg(String(e)); }
    setBusy(false);
  }

  return (
    <div>
      {loading ? <div className="loading">Loading…</div> : (
        <div className="panel">
          <label className="muted" style={{ fontSize: 13 }}>Sales reps (round-robin order)</label>
          <ChipInput values={reps} onChange={setReps} placeholder="Add a rep's name and press Enter…" />

          <label className="muted" style={{ fontSize: 13, display: 'block', marginTop: 12 }}>
            Google Chat space URL (optional — this workspace’s own space; else the shared default is used)
          </label>
          <input className="input" type="url" placeholder="https://chat.googleapis.com/v1/spaces/…"
            value={webhook} onChange={(e) => setWebhook(e.target.value)} style={{ minWidth: 360, marginTop: 4 }} />

          <div className="toolbar bare mt-3" style={{ marginBottom: 0, alignItems: 'center' }}>
            <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save roster'}</button>
            {msg && <span className="muted">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
