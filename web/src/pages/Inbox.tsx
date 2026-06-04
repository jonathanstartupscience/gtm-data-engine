import { useEffect, useState, useCallback } from 'react';
import { api, type Reply } from '../api.js';

/** Inbox — replies from campaigns, positive ones surfaced first so you can jump on them fast. */
export function Inbox() {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [positiveOnly, setPositiveOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.inbox(positiveOnly).then((d) => setReplies(d.replies)).finally(() => setLoading(false));
  }, [positiveOnly]);
  useEffect(load, [load]);

  async function sync() {
    setSyncing(true); setNote('');
    try { const r = await api.inboxSync(); setNote(`Pulled ${r.pulled} replies (${r.added} new).`); load(); }
    catch (e) { setNote('Sync failed: ' + String(e)); }
    setSyncing(false);
  }

  async function act(r: Reply, body: { status?: string; markInterested?: boolean }) {
    await api.inboxAction(r.id, body);
    load();
  }

  return (
    <>
      <h1 className="page-title">Inbox</h1>
      <p className="page-sub">Replies from your campaigns. Positive and interested replies are surfaced first — respond fast while the intent is warm.</p>

      <div className="toolbar" style={{ alignItems: 'center' }}>
        <button className="btn" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync replies'}</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={positiveOnly} onChange={(e) => setPositiveOnly(e.target.checked)} /> Positive only
        </label>
        {note && <span className="muted">{note}</span>}
      </div>

      {loading ? <div className="loading">Loading…</div> : replies.length === 0 ? (
        <div className="panel"><p className="muted">No {positiveOnly ? 'positive ' : ''}replies yet. Replies arrive via the Bison webhook, or click “Sync replies” to pull the latest.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {replies.map((r) => (
            <div key={r.id} className="panel" style={{ borderLeft: `3px solid ${r.isPositive ? 'var(--green)' : 'var(--border)'}`, opacity: r.status === 'handled' ? 0.6 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <div>
                  <strong>{r.leadName || r.leadEmail || 'Unknown'}</strong>
                  {r.leadEmail && r.leadName && <span className="muted"> · {r.leadEmail}</span>}
                  {r.isPositive && <span className="tag deliverable" style={{ marginLeft: 8 }}>{r.sentiment ?? 'positive'}</span>}
                  {r.status !== 'new' && <span className="tag unknown" style={{ marginLeft: 6 }}>{r.status}</span>}
                </div>
                <span className="muted" style={{ fontSize: 13 }}>{new Date(r.receivedAt).toLocaleString()}</span>
              </div>
              {r.subject && <div style={{ fontWeight: 600, marginTop: 6 }}>{r.subject}</div>}
              {r.body && <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>{r.body}</div>}
              <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
                {r.leadEmail && <a className="btn btn-primary" href={`mailto:${r.leadEmail}${r.subject ? `?subject=${encodeURIComponent('Re: ' + r.subject)}` : ''}`}>Reply</a>}
                {!r.isPositive && <button className="btn" onClick={() => act(r, { markInterested: true })}>Mark interested</button>}
                {r.status !== 'handled' && <button className="btn" onClick={() => act(r, { status: 'handled' })}>Mark handled</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
