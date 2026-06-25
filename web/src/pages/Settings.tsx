import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ManagedKey, type Connector, type VendorCredits } from '../api.js';

/**
 * Settings — the ONE global, account-wide settings panel for the whole GTM system (Data + Email +
 * LinkedIn engines share it). Reached from the gear link pinned above the profile, so it's the same
 * place in every workspace. It holds everything account-wide:
 *   • Vendor API keys (encrypted at rest, no redeploy) — the writable controls.
 *   • Connectors — a read-only status view of those same vendors (connected / not configured).
 *   • Credit balances — live balances for the metered vendors.
 * Engine-SPECIFIC settings deliberately do NOT live here: the per-persona Email Bison key, persona
 * scope and reply-routing roster are per-workspace, so they stay on Email Engine → Workspaces. We
 * link over to them rather than duplicate them.
 */
export function Settings() {
  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">
        Global settings for the whole GTM system — these apply across the Data, Email, and LinkedIn
        engines. Keys are encrypted at rest and set without a redeploy.
      </p>

      <VendorKeys />
      <ConnectorStatus />

      <div className="panel" style={{ marginTop: 24, borderLeft: '3px solid var(--accent, #4f8cff)' }}>
        <strong>Looking for per-workspace Email settings?</strong>
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 14 }}>
          Each Email-Engine persona workspace has its OWN Bison API key, persona scope, and reply-routing
          roster — those aren’t global, so they live with the engine. Set them on{' '}
          <Link to="/email/workspaces">Email Engine → Workspaces</Link> (switch workspace in the nav first).
        </p>
      </div>
    </>
  );
}

/** The writable vendor-key controls (formerly the whole Settings page). */
function VendorKeys() {
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
    <section>
      <h2 style={{ margin: '8px 0 4px', fontSize: 18 }}>Vendor API keys</h2>
      <p className="page-sub" style={{ marginTop: 0 }}>Set or rotate vendor keys here — shown only as a masked preview once saved.</p>

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
    </section>
  );
}

/** Read-only connector status + credit balances (formerly the standalone Connectors page). */
function ConnectorStatus() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [credits, setCredits] = useState<VendorCredits[] | null>(null);
  useEffect(() => {
    api.connectors().then((d) => setConnectors(d.connectors)).catch(() => {});
    api.connectorCredits().then((d) => setCredits(d.vendors)).catch(() => setCredits([]));
  }, []);

  // HubSpot has a dedicated detail page; the rest are configured via the keys above.
  const PAGE: Record<string, string> = { hubspot: '/connectors/hubspot' };

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ margin: '8px 0 4px', fontSize: 18 }}>Connectors</h2>
      <p className="page-sub" style={{ marginTop: 0 }}>The external systems wired into the engine — what each does and whether it’s connected. Configure them with the keys above.</p>

      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {connectors.map((c) => {
          const href = PAGE[c.id];
          const inner = (
            <div className="card" style={{ height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{c.name}</div>
                <span style={{
                  fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 999,
                  background: c.connected ? 'rgba(101,194,56,0.14)' : 'rgba(196,117,91,0.12)',
                  color: c.connected ? 'var(--green-deep)' : 'var(--coral)',
                }}>{c.connected ? '● Connected' : '○ Not configured'}</span>
              </div>
              <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>{c.role}</div>
              {href && <div style={{ marginTop: 12, color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>Open →</div>}
            </div>
          );
          return href
            ? <Link key={c.id} to={href} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link>
            : <div key={c.id}>{inner}</div>;
        })}
      </div>

      <h3 style={{ margin: '28px 0 12px' }}>Credit balances</h3>
      <p className="page-sub" style={{ marginTop: -6 }}>Live balances for the metered vendors, with what each buys you.</p>
      {credits === null ? <div className="loading">Loading balances…</div> : (
        <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {credits.filter((v) => v.configured).map((v) => (
            <div className="card" key={v.id}>
              <div className="num" style={{ fontSize: 28 }}>{v.credits == null ? '—' : v.credits.toLocaleString()}</div>
              <div className="label">{v.name} credits</div>
              {v.relatable && <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>{v.relatable}</div>}
              {v.credits == null && <div className="muted" style={{ marginTop: 8, fontSize: 12, color: 'var(--coral)' }}>Couldn’t fetch — check the key.</div>}
            </div>
          ))}
          {credits.filter((v) => v.configured).length === 0 && <div className="panel"><p className="muted">No metered vendors connected yet.</p></div>}
        </div>
      )}
    </section>
  );
}
