import { useState } from 'react';
import { api, type EmailWorkspace, type SecretStatus } from '../api.js';
import { useWorkspace } from '../workspace.js';
import { ReplyRouting } from '../components/ReplyRouting.js';

/**
 * Email-Engine Workspaces — the settings for the ACTIVE workspace only: its Email Bison API key
 * (EMAILBISON_API_KEY__<slug>) and its reply-routing roster. Mirrors the rest of the Email Engine,
 * which is always scoped to the workspace picked in the nav selector — switch workspace there to
 * configure a different persona. Each workspace authenticates as itself; there is no global Bison
 * key or global rep roster. Setting a key here uses the same encrypted store as Settings (no redeploy).
 */
export function Workspaces() {
  const { active, loading, reload } = useWorkspace();

  if (loading) return <><h1 className="page-title">Workspace settings</h1><div className="loading">Loading…</div></>;
  if (!active) return <><h1 className="page-title">Workspace settings</h1><p className="page-sub">No workspace selected.</p></>;

  return (
    <>
      <h1 className="page-title">{active.name} — settings</h1>
      <p className="page-sub">
        Each workspace has its own Email Bison key, so campaigns, sequences and experiments are
        attributed to the right persona. Switch workspace in the nav to configure another. Other
        vendor keys live on <strong>Settings</strong>.
      </p>

      <WorkspaceCard ws={active} onKeyChange={reload} />
    </>
  );
}

function keyTag(ws: EmailWorkspace, status: SecretStatus | null) {
  // After a save/clear we have the precise SecretStatus (with mask); otherwise use the list's keySource.
  if (status) {
    return status.set
      ? <span className="tag deliverable">key set · {status.masked}</span>
      : <span className="tag unknown">no key</span>;
  }
  return ws.keySource === 'workspace'
    ? <span className="tag deliverable">key set</span>
    : <span className="tag unknown">no key</span>;
}

function WorkspaceCard({ ws, onKeyChange }: { ws: EmailWorkspace; onKeyChange: () => void }) {
  const secretKey = `EMAILBISON_API_KEY__${ws.slug}`;
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<SecretStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    const value = draft.trim();
    if (value.length < 8) { setMsg('Key looks too short.'); return; }
    setBusy(true); setMsg('');
    try {
      const r = await api.setSecret(secretKey, value);
      setStatus({ set: r.set, source: r.source, masked: r.masked });
      setDraft(''); setMsg('Bison key saved.'); onKeyChange();
    } catch { setMsg('Couldn’t save the key — check it’s the right Email Bison API key, then try again.'); }
    setBusy(false);
  }

  async function clear() {
    if (!confirm(`Remove the Bison key for ${ws.name}? This workspace won’t be able to send until a new key is set.`)) return;
    setBusy(true); setMsg('');
    try {
      const r = await api.clearSecret(secretKey);
      setStatus({ set: r.set, source: r.source, masked: r.masked });
      setMsg('Bison key removed.'); onKeyChange();
    } catch { setMsg('Couldn’t remove the key — try again.'); }
    setBusy(false);
  }

  // "key set" if we've confirmed it this session, else fall back to the list's view.
  const keySet = status ? status.set : ws.keySource === 'workspace';

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h3 style={{ margin: 0 }}>
          Email Bison API key
          <span className={'ws-status' + (ws.sending ? ' sending' : '')}
            style={{ display: 'inline-flex', marginLeft: 10, fontSize: 12, verticalAlign: 'middle' }}
            title={ws.sending
              ? `${ws.activeCampaigns} active campaign${ws.activeCampaigns === 1 ? '' : 's'} sending`
              : 'No active campaigns'}>
            <span className="ws-status-dot" aria-hidden="true" /> {ws.sending ? 'sending' : 'idle'}
          </span>
        </h3>
        {keyTag(ws, status)}
      </div>

      <p className="muted" style={{ margin: '6px 0 12px' }}>
        Find it in Email Bison: {ws.name} workspace → API → copy the key.
        {!keySet && ' Without a key, this workspace can’t send.'}
      </p>

      <div className="toolbar" style={{ marginBottom: 0, alignItems: 'center' }}>
        <input className="input" type="password" aria-label="Email Bison API key"
          placeholder={keySet ? 'Enter a new key to replace…' : 'Paste API key…'}
          value={draft} onChange={(e) => setDraft(e.target.value)} style={{ minWidth: 280 }} />
        <button className="btn btn-primary" disabled={busy || !draft.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {keySet && <button className="btn" disabled={busy} onClick={clear} style={{ color: 'var(--coral)' }}>Remove</button>}
        {msg && <span className="muted">{msg}</span>}
      </div>

      <WorkspaceScope ws={ws} onSaved={onKeyChange} />

      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border, #e5e5e5)' }}>
        <strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Reply routing</strong>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
          On a reply, we post a Google Chat alert and tag the next rep in this roster (round-robin).
          Reps claim and respond in the Inbox.
        </p>
        <ReplyRouting reloadKey={ws.slug} />
      </div>
    </div>
  );
}

/**
 * Workspace persona scope + a "Test connection" button. The Bison base URL is NOT here — it's one
 * shared account-wide setting (Settings → "Email Bison instance URL"); a workspace is distinguished
 * by its API key, not its URL. The persona scope is a LIKE pattern mapping the workspace to a SET of
 * contact personas. Test connection hits an authenticated Bison GET (using this workspace's key +
 * the shared base) and surfaces a bad key immediately, instead of it looking like "no senders."
 */
function WorkspaceScope({ ws, onSaved }: { ws: EmailWorkspace; onSaved: () => void }) {
  const [scope, setScope] = useState(ws.personaMatch ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [test, setTest] = useState<{ ok: boolean; senderCount?: number; totalDailyCapacity?: number; detail?: string } | null>(null);

  async function save() {
    setBusy(true); setMsg('');
    try {
      await api.outboundWorkspaceSettings(ws.slug, { personaMatch: scope.trim() || null });
      setMsg('Persona scope saved.'); onSaved();
    } catch { setMsg('Couldn’t save the persona scope — try again.'); }
    setBusy(false);
  }

  async function testConn() {
    setBusy(true); setMsg(''); setTest(null);
    try {
      setTest(await api.outboundTestConnection(ws.slug));
    } catch (e) { setTest({ ok: false, detail: String(e) }); }
    setBusy(false);
  }

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border, #e5e5e5)' }}>
      <strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Persona scope &amp; connection</strong>
      <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
        Pattern matching this workspace’s personas — e.g. <code>ESO %</code> matches every
        <code> ESO …</code> persona. Blank = exact persona (<code>{ws.persona ?? '—'}</code>).
        The Bison instance URL is shared across workspaces (on <strong>Settings</strong>); the key
        picks the workspace.
      </p>
      <div className="toolbar" style={{ marginBottom: 8, alignItems: 'center' }}>
        <input className="input" aria-label="Persona scope pattern" placeholder="e.g. ESO % (blank = exact persona)"
          value={scope} onChange={(e) => setScope(e.target.value)} style={{ minWidth: 320 }} />
      </div>

      <div className="toolbar" style={{ marginBottom: 0, alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button className="btn" disabled={busy} onClick={testConn}>Test connection</button>
        {msg && <span className="muted">{msg}</span>}
      </div>

      {test && (
        <p className={'muted'} style={{ marginTop: 8, fontSize: 13, color: test.ok ? 'var(--green, #1a7f37)' : 'var(--coral)' }}>
          {test.ok
            ? `Connected ✓ — ${test.senderCount} sender inbox${test.senderCount === 1 ? '' : 'es'}, ${test.totalDailyCapacity}/day total capacity.`
            : `Connection failed — ${test.detail}`}
        </p>
      )}
    </div>
  );
}
