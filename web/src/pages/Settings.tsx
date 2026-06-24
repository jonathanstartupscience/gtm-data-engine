import { useEffect, useState } from 'react';
import { api, type ManagedKey, type NotifyRoute } from '../api.js';
import { ChipInput } from '../components/ChipInput.js';

/** Settings — manage vendor API keys at runtime (stored encrypted server-side). No redeploy needed. */
export function Settings() {
  const [canStore, setCanStore] = useState(true);
  const [keys, setKeys] = useState<ManagedKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<Record<string, string>>({});

  function load() {
    setLoading(true);
    api.settings().then((d) => { setCanStore(d.canStore); setKeys(d.keys); }).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function save(key: string) {
    const value = (drafts[key] ?? '').trim();
    if (value.length < 8) { setMsg((m) => ({ ...m, [key]: 'Key looks too short.' })); return; }
    setBusy(key); setMsg((m) => ({ ...m, [key]: '' }));
    try { await api.setSecret(key, value); setDrafts((d) => ({ ...d, [key]: '' })); setMsg((m) => ({ ...m, [key]: 'Saved ✓' })); load(); }
    catch (e) { setMsg((m) => ({ ...m, [key]: String(e) })); }
    setBusy('');
  }
  async function clear(key: string) {
    if (!confirm('Remove this key? The app will fall back to the Railway env var (if any).')) return;
    setBusy(key); await api.clearSecret(key); setMsg((m) => ({ ...m, [key]: 'Removed' })); load(); setBusy('');
  }
  async function test(key: string) {
    setBusy(key); setMsg((m) => ({ ...m, [key]: 'Testing…' }));
    try { const r = await api.testSecret(key); setMsg((m) => ({ ...m, [key]: (r.ok ? '✓ ' : '✗ ') + r.detail })); }
    catch (e) { setMsg((m) => ({ ...m, [key]: String(e) })); }
    setBusy('');
  }

  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Manage vendor API keys here — set or rotate them without touching Railway. Keys are encrypted at rest and shown only as a masked preview once saved.</p>

      {!canStore && (
        <div className="panel" style={{ marginBottom: 16, borderLeft: '3px solid var(--amber)' }}>
          To store keys from the app, set <code>APP_ENCRYPTION_KEY</code> (any long random string) in Railway once.
          Until then, keys can only be set as Railway env vars. The fields below are disabled.
        </div>
      )}

      {loading ? <div className="loading">Loading…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {keys.map((k) => (
            <div key={k.key} className="panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <h3 style={{ margin: 0 }}>{k.label}</h3>
                {k.set
                  ? <span className="tag deliverable">set · {k.source === 'db' ? 'saved here' : 'from Railway'} · {k.masked}</span>
                  : <span className="tag unknown">not set</span>}
              </div>
              <p className="muted" style={{ margin: '6px 0 12px' }}>{k.help}</p>
              <div className="toolbar" style={{ marginBottom: 0, alignItems: 'center' }}>
                <input className="input" type="password" placeholder={k.set ? 'Enter a new key to replace…' : 'Paste API key…'}
                  value={drafts[k.key] ?? ''} disabled={!canStore}
                  onChange={(e) => setDrafts((d) => ({ ...d, [k.key]: e.target.value }))} style={{ minWidth: 280 }} />
                <button className="btn btn-primary" disabled={!canStore || busy === k.key || !(drafts[k.key] ?? '').trim()} onClick={() => save(k.key)}>
                  {busy === k.key ? 'Saving…' : 'Save'}
                </button>
                {k.testable && k.set && <button className="btn" disabled={busy === k.key} onClick={() => test(k.key)}>Test</button>}
                {k.set && k.source === 'db' && <button className="btn" disabled={busy === k.key} onClick={() => clear(k.key)} style={{ color: 'var(--coral)' }}>Remove</button>}
                {msg[k.key] && <span className="muted">{msg[k.key]}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <ReplyRouting />
    </>
  );
}

/**
 * Reply routing — the round-robin roster of sales reps that reply alerts cycle through, plus the
 * Google Chat space they post to. Scoped to the active Email-Engine workspace; falls back to the
 * global default when a workspace has no roster of its own.
 */
function ReplyRouting() {
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
  useEffect(load, []);

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
    <div style={{ marginTop: 28 }}>
      <h2 className="page-title" style={{ fontSize: 20 }}>Reply routing</h2>
      <p className="page-sub">
        When a prospect replies, we post an alert to Google Chat and tag the next rep in this roster
        (round-robin). Reps claim the reply in the Inbox and respond from there. Set the global default,
        or override it for this workspace.
      </p>
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
