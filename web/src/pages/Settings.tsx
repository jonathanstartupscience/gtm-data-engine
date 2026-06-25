import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type ManagedKey, type Connector, type VendorCredits } from '../api.js';

/**
 * Settings — the ONE global, account-wide settings panel for the whole GTM system. Reached from the
 * gear link pinned above the profile, the same in every workspace.
 *
 * Connectors and their API keys are ONE concept, shown once: each connector is a row with its status,
 * masked key, and an inline edit control — so a broken connector is fixed where it's shown. Email
 * Bison is per-workspace (no global key) and links to Workspaces. Credit balances render as bullets
 * with a last-updated tag + a manual Refresh. Engine-specific (per-workspace) settings stay with the
 * Email Engine; we link over rather than duplicate.
 */
export function Settings() {
  return (
    <>
      <h1 className="page-title">Settings</h1>
      <p className="page-sub">Global settings for the whole GTM system — Data, Email, and LinkedIn engines. Keys are encrypted at rest; no redeploy.</p>

      <Connectors />
      <CreditBalances />

      <p className="muted mt-6" style={{ fontSize: 13 }}>
        Per-workspace Email settings (each persona’s Bison key, persona scope, reply routing) live on{' '}
        <Link to="/email/workspaces">Email Engine → Workspaces</Link>.
      </p>
    </>
  );
}

/**
 * Unified connector rows: status + masked key + inline edit. The writable key IS the connector, so
 * there's no separate "vendor keys" section. Joins /connectors (status + key name + masked) with
 * /settings (the managed-key metadata: hint, testable, canStore).
 */
function Connectors() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [keys, setKeys] = useState<Record<string, ManagedKey>>({});
  const [canStore, setCanStore] = useState(true);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    Promise.all([api.connectors(), api.settings()]).then(([c, s]) => {
      setConnectors(c.connectors);
      setCanStore(s.canStore);
      setKeys(Object.fromEntries(s.keys.map((k) => [k.key, k])));
    }).finally(() => setLoading(false));
  }
  useEffect(load, []);

  return (
    <section>
      <h2 className="section-title">Connectors</h2>
      <p className="page-sub" style={{ marginTop: 0 }}>The external systems wired into the engine. Set or rotate a key to connect one.</p>

      {!canStore && (
        <div className="panel mb-3" style={{ borderLeft: '3px solid var(--amber)' }}>
          Set <code>APP_ENCRYPTION_KEY</code> in Railway once to manage keys here. Until then they’re env-only and these controls are disabled.
        </div>
      )}

      {loading ? <div className="loading">Loading…</div> : (
        <div className="conn-list">
          {connectors.map((c) => (
            <ConnectorRow key={c.id} connector={c} meta={c.key ? keys[c.key] : undefined} canStore={canStore} onChanged={load} />
          ))}
        </div>
      )}
    </section>
  );
}

function ConnectorRow({ connector: c, meta, canStore, onChanged }: {
  connector: Connector; meta?: ManagedKey; canStore: boolean; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    if (!c.key || draft.trim().length < 8) { setMsg('Key looks too short.'); return; }
    setBusy(true); setMsg('');
    try { await api.setSecret(c.key, draft.trim()); setDraft(''); setEditing(false); onChanged(); }
    catch (e) { setMsg(String(e)); }
    setBusy(false);
  }
  async function remove() {
    if (!c.key || !confirm(`Remove the ${c.name} key? It’ll fall back to the Railway env var if one exists.`)) return;
    setBusy(true); try { await api.clearSecret(c.key); onChanged(); } catch (e) { setMsg(String(e)); } setBusy(false);
  }
  async function test() {
    if (!c.key) return;
    setBusy(true); setMsg('Testing…');
    try { const r = await api.testSecret(c.key); setMsg((r.ok ? '✓ ' : '✗ ') + r.detail); }
    catch (e) { setMsg(String(e)); }
    setBusy(false);
  }

  return (
    <div className="conn-row">
      <div className="conn-main">
        <span className={'status-dot' + (c.connected ? ' on' : '')} aria-hidden />
        <span className="conn-name">{c.name}</span>
        <span className="conn-role muted">{c.role}</span>
      </div>

      <div className="conn-right">
        {c.perWorkspace ? (
          <Link to={c.manage ?? '/email/workspaces'} className="btn btn-sm">Per-workspace →</Link>
        ) : !editing ? (
          <>
            {c.masked && <code className="conn-masked">{c.masked}</code>}
            <span className={'tag ' + (c.connected ? 'deliverable' : 'unknown')}>{c.connected ? (c.source === 'env' ? 'env' : 'set') : 'not set'}</span>
            <button className="btn btn-sm" disabled={!canStore} onClick={() => { setEditing(true); setMsg(''); }}>
              {c.connected ? 'Edit' : 'Add key'}
            </button>
          </>
        ) : (
          <div className="conn-edit">
            <input className="input" type="password" autoFocus placeholder="Paste key…"
              value={draft} onChange={(e) => setDraft(e.target.value)} style={{ minWidth: 240 }} />
            <button className="btn btn-primary btn-sm" disabled={busy || !draft.trim()} onClick={save}>{busy ? '…' : 'Save'}</button>
            {meta?.testable && c.connected && <button className="btn btn-sm" disabled={busy} onClick={test}>Test</button>}
            {c.connected && c.source === 'db' && <button className="btn btn-sm" disabled={busy} onClick={remove} style={{ color: 'var(--coral)' }}>Remove</button>}
            <button className="btn btn-sm" disabled={busy} onClick={() => { setEditing(false); setDraft(''); setMsg(''); }}>Cancel</button>
          </div>
        )}
      </div>

      {(meta?.hint || msg) && (
        <div className="conn-hint muted">{msg || meta?.hint}{c.id === 'hubspot' && !msg && <> · <Link to="/connectors/hubspot">sync details</Link></>}</div>
      )}
    </div>
  );
}

/** Credit balances — structured bullets per vendor, a last-updated tag, and a manual Refresh. */
function CreditBalances() {
  const [vendors, setVendors] = useState<VendorCredits[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    setBusy(true);
    api.connectorCredits()
      .then((d) => { setVendors(d.vendors); setFetchedAt(d.fetchedAt); })
      .catch(() => setVendors([]))
      .finally(() => setBusy(false));
  }
  useEffect(load, []);

  const configured = (vendors ?? []).filter((v) => v.configured);

  return (
    <section className="mt-6">
      <div className="section-head">
        <h2 className="section-title" style={{ margin: 0 }}>Credit balances</h2>
        <div className="section-head-right">
          {fetchedAt && <span className="muted" style={{ fontSize: 12 }}>Updated {new Date(fetchedAt).toLocaleTimeString()}</span>}
          <button className="btn btn-sm" disabled={busy} onClick={load}>{busy ? 'Refreshing…' : 'Refresh'}</button>
        </div>
      </div>

      {vendors === null ? <div className="loading">Loading…</div>
        : configured.length === 0 ? <p className="muted">No metered vendors connected yet.</p>
        : (
          <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {configured.map((v) => (
              <div className="card" key={v.id}>
                <div className="num" style={{ fontSize: 28 }}>{v.credits == null ? '—' : v.credits.toLocaleString()}</div>
                <div className="label">{v.name} credits</div>
                {v.credits == null
                  ? <div className="muted" style={{ marginTop: 8, fontSize: 12, color: 'var(--coral)' }}>Couldn’t fetch — check the key.</div>
                  : v.metrics.length > 0 && (
                    <ul className="credit-metrics muted">
                      {v.metrics.map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  )}
              </div>
            ))}
          </div>
        )}
    </section>
  );
}
