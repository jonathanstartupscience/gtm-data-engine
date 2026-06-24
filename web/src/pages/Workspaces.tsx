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
        Settings for the <strong>{active.name}</strong> workspace — the one selected in the Email Engine
        nav. Each workspace has its own Email Bison API key, so every campaign, sequence and experiment
        is attributed to the right persona. To configure another persona, switch workspace in the nav
        selector. (The encryption key that protects these, <code>APP_ENCRYPTION_KEY</code>, is set once
        in Railway; other vendor keys live on <strong>Settings</strong>.)
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
      setDraft(''); setMsg('Saved ✓'); onKeyChange();
    } catch (e) { setMsg(String(e)); }
    setBusy(false);
  }

  async function clear() {
    if (!confirm(`Remove the Bison key for ${ws.name}? This workspace won’t be able to send until a new key is set.`)) return;
    setBusy(true); setMsg('');
    try {
      const r = await api.clearSecret(secretKey);
      setStatus({ set: r.set, source: r.source, masked: r.masked });
      setMsg('Removed'); onKeyChange();
    } catch (e) { setMsg(String(e)); }
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
            <span className="ws-status-dot" /> {ws.sending ? 'sending' : 'idle'}
          </span>
        </h3>
        {keyTag(ws, status)}
      </div>

      <p className="muted" style={{ margin: '6px 0 12px' }}>
        Email Bison → switch into the {ws.name} workspace → API → copy the key. Paste it here.
        {!keySet && ' Until a key is set, this workspace can’t send.'}
      </p>

      <div className="toolbar" style={{ marginBottom: 0, alignItems: 'center' }}>
        <input className="input" type="password"
          placeholder={keySet ? 'Enter a new key to replace…' : 'Paste API key…'}
          value={draft} onChange={(e) => setDraft(e.target.value)} style={{ minWidth: 280 }} />
        <button className="btn btn-primary" disabled={busy || !draft.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {keySet && <button className="btn" disabled={busy} onClick={clear} style={{ color: 'var(--coral)' }}>Remove</button>}
        {msg && <span className="muted">{msg}</span>}
      </div>

      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border, #e5e5e5)' }}>
        <strong style={{ fontSize: 14, display: 'block', marginBottom: 8 }}>Reply routing</strong>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>
          When a prospect replies, we post an alert to Google Chat and tag the next rep in this roster
          (round-robin). Reps claim the reply in the Inbox and respond from there.
        </p>
        <ReplyRouting reloadKey={ws.slug} />
      </div>
    </div>
  );
}
