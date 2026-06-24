import { useEffect, useState } from 'react';
import { api, type ManagedKey } from '../api.js';
import { ReplyRouting } from '../components/ReplyRouting.js';

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
