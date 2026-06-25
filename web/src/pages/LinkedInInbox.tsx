import { useEffect, useState, useCallback } from 'react';
import { api, type LiReply } from '../api.js';
import { PageHeader, EmptyState } from '../components/PageHeader.js';

/** LinkedIn Inbox — conversations from HeyReach campaigns, positive/lead-originated surfaced first. */
export function LinkedInInbox() {
  const [configured, setConfigured] = useState(true);
  const [replies, setReplies] = useState<LiReply[]>([]);
  const [positiveOnly, setPositiveOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.liInbox(positiveOnly).then((d) => { setConfigured(d.configured); setReplies(d.replies); }).finally(() => setLoading(false));
  }, [positiveOnly]);
  useEffect(load, [load]);

  async function sync() {
    setSyncing(true); setNote('');
    try {
      const r = await api.liInboxSync();
      if ('configured' in r && r.configured === false) setNote(r.message);
      else { const rr = r as { pulled: number; added: number }; setNote(`Pulled ${rr.pulled} conversations (${rr.added} new).`); load(); }
    } catch (e) { setNote('Sync failed: ' + String(e)); }
    setSyncing(false);
  }

  async function act(r: LiReply, status: string) { await api.liInboxAction(r.id, { status }); load(); }

  return (
    <>
      <PageHeader title="LinkedIn Inbox" sub="Replies surface here; respond in the LinkedIn thread itself." />

      <div className="toolbar" style={{ alignItems: 'center' }}>
        <button className="btn" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync conversations'}</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={positiveOnly} onChange={(e) => setPositiveOnly(e.target.checked)} /> Replies only
        </label>
        {note && <span className="muted">{note}</span>}
      </div>

      {!configured && (
        <div className="callout callout-warn mb-4">
          HeyReach isn’t connected. Add <code>HEYREACH_API_KEY</code> in Railway to pull conversations.
        </div>
      )}

      {loading ? <div className="loading">Loading…</div> : replies.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="No conversations yet"
            hint={positiveOnly ? 'Showing replies only — uncheck to see every conversation.' : 'Sync to pull conversations from HeyReach.'}
            action={<button className="btn btn-primary" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync conversations'}</button>}
          />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {replies.map((r) => (
            <div key={r.id} className="panel" style={{ borderLeft: `3px solid ${r.isPositive ? '#0a66c2' : 'var(--border)'}`, opacity: r.status === 'handled' ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <div>
                  <strong>{r.leadName || 'LinkedIn contact'}</strong>
                  {r.company && <span className="muted"> · {r.company}</span>}
                  {r.status !== 'new' && <span className="tag unknown" style={{ marginLeft: 6 }}>{r.status}</span>}
                </div>
                <span className="muted text-sm">{new Date(r.receivedAt).toLocaleString()}</span>
              </div>
              {r.lastMessage && <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--text-secondary)', marginTop: 6 }}>{r.lastMessage}</div>}
              <div className="toolbar mt-3 mb-0">
                {r.profileUrl && <a className="btn btn-primary" href={r.profileUrl} target="_blank" rel="noreferrer">Open in LinkedIn</a>}
                {r.status !== 'handled' && <button className="btn" onClick={() => act(r, 'handled')}>Mark handled</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
