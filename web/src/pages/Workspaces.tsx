import { useState } from 'react';
import { api, type EmailWorkspace, type SecretStatus } from '../api.js';
import { useWorkspace } from '../workspace.js';
import { ReplyRouting } from '../components/ReplyRouting.js';

/**
 * Email-Engine Workspaces — the contextual home for everything workspace-specific:
 * each persona workspace's Email Bison API key (EMAILBISON_API_KEY__<slug>) and its reply-routing
 * override. Setting a key here is identical to the global Settings page (same encrypted store, no
 * redeploy) — it just lives where you actually work, so you can configure all six before building
 * campaigns. The global/fallback Bison key, HeyReach, Anthropic and Google Chat keys stay on Settings.
 *
 * Reply routing's "This workspace" scope follows the ACTIVE workspace, so selecting a row makes it
 * active first (persists via the WorkspaceProvider) before showing its key + routing.
 */
export function Workspaces() {
  const { workspaces, activeSlug, setActive, reload } = useWorkspace();

  return (
    <>
      <h1 className="page-title">Workspaces</h1>
      <p className="page-sub">
        One Email Bison workspace per persona, each with its own API key — so every campaign, sequence
        and experiment is attributed to the right persona. Set each workspace’s key below; an unset
        workspace falls back to the global Bison key (manage that, plus HeyReach/Anthropic/Google Chat,
        on <strong>Settings</strong>). The encryption key that protects these is <code>APP_ENCRYPTION_KEY</code>,
        set once in Railway.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {workspaces.map((w) => (
          <WorkspaceCard
            key={w.slug}
            ws={w}
            isActive={w.slug === activeSlug}
            onSelect={() => setActive(w.slug)}
            onKeyChange={reload}
          />
        ))}
      </div>
    </>
  );
}

function keyTag(ws: EmailWorkspace, status: SecretStatus | null) {
  // After a save/clear we have the precise SecretStatus (with mask); otherwise use the list's keySource.
  if (status) {
    return status.set
      ? <span className="tag deliverable">own key · {status.masked}</span>
      : <span className="tag unknown">no own key</span>;
  }
  if (ws.keySource === 'workspace') return <span className="tag deliverable">own key set</span>;
  if (ws.keySource === 'global') return <span className="tag unknown">using global fallback</span>;
  return <span className="tag unknown">no key</span>;
}

function WorkspaceCard({
  ws, isActive, onSelect, onKeyChange,
}: {
  ws: EmailWorkspace;
  isActive: boolean;
  onSelect: () => void;
  onKeyChange: () => void;
}) {
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
    if (!confirm(`Remove the Bison key for ${ws.name}? It will fall back to the global key (if set).`)) return;
    setBusy(true); setMsg('');
    try {
      const r = await api.clearSecret(secretKey);
      setStatus({ set: r.set, source: r.source, masked: r.masked });
      setMsg('Removed'); onKeyChange();
    } catch (e) { setMsg(String(e)); }
    setBusy(false);
  }

  // "own key set" if we've confirmed it this session, else fall back to the list's view.
  const ownKeySet = status ? status.set : ws.keySource === 'workspace';

  return (
    <div className="panel" style={isActive ? { borderLeft: '3px solid var(--accent, #4d4d9d)' } : undefined}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <h3 style={{ margin: 0 }}>
          {ws.name}
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
        {!ownKeySet && ws.keySource === 'global' && ' Until then this workspace sends on the global fallback key.'}
      </p>

      <div className="toolbar" style={{ marginBottom: 0, alignItems: 'center' }}>
        <input className="input" type="password"
          placeholder={ownKeySet ? 'Enter a new key to replace…' : 'Paste API key…'}
          value={draft} onChange={(e) => setDraft(e.target.value)} style={{ minWidth: 280 }} />
        <button className="btn btn-primary" disabled={busy || !draft.trim()} onClick={save}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {ownKeySet && <button className="btn" disabled={busy} onClick={clear} style={{ color: 'var(--coral)' }}>Remove</button>}
        {msg && <span className="muted">{msg}</span>}
      </div>

      <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border, #e5e5e5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <strong style={{ fontSize: 14 }}>Reply routing</strong>
          {!isActive && (
            <button className="btn" onClick={onSelect}>Select to edit this workspace’s routing</button>
          )}
        </div>
        {isActive
          ? <ReplyRouting reloadKey={ws.slug} heading={false} />
          : <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Select this workspace to set its round-robin reply roster and Google Chat override.
            </p>}
      </div>
    </div>
  );
}
