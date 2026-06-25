import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type Reply, type BisonSenderOption } from '../api.js';

/**
 * Inbox — replies from campaigns, positive ones surfaced first so reps can jump on them fast.
 * Speed-to-lead handoff: a rep CLAIMS a reply (so two reps don't collide), then REPLIES from inside
 * the app — sent through Bison from a chosen sender inbox, threaded on the original conversation.
 * A Google Chat alert deep-links here (?reply=<id>) so the assigned rep lands straight on the lead.
 */
export function Inbox() {
  const [replies, setReplies] = useState<Reply[]>([]);
  const [positiveOnly, setPositiveOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState('');
  const [senders, setSenders] = useState<BisonSenderOption[]>([]);
  const [params, setParams] = useSearchParams();
  const focusId = params.get('reply');

  const load = useCallback(() => {
    setLoading(true);
    api.inbox(positiveOnly).then((d) => setReplies(d.replies)).finally(() => setLoading(false));
  }, [positiveOnly]);
  useEffect(load, [load]);

  // Sender inboxes power the "reply from" picker; load once (best-effort).
  useEffect(() => { api.inboxSenders().then((d) => setSenders(d.senders)).catch(() => {}); }, []);

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
      <p className="page-sub">Replies from your campaigns, positive and interested ones first — claim one and reply while the intent is warm.</p>

      <div className="toolbar" style={{ alignItems: 'center' }}>
        <button className="btn" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync replies'}</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={positiveOnly} onChange={(e) => setPositiveOnly(e.target.checked)} /> Positive only
        </label>
        {note && <span className="muted">{note}</span>}
      </div>

      {loading ? <div className="loading">Loading…</div> : replies.length === 0 ? (
        <div className="panel"><p className="muted">No {positiveOnly ? 'positive ' : ''}replies yet. Replies arrive via the Bison webhook, or Sync replies to pull the latest.</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {replies.map((r) => (
            <ReplyCard
              key={r.id}
              reply={r}
              senders={senders}
              focused={String(r.id) === focusId}
              onChanged={load}
              onAct={act}
              clearFocus={() => { params.delete('reply'); setParams(params, { replace: true }); }}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ReplyCard({ reply: r, senders, focused, onChanged, onAct, clearFocus }: {
  reply: Reply;
  senders: BisonSenderOption[];
  focused: boolean;
  onChanged: () => void;
  onAct: (r: Reply, body: { status?: string; markInterested?: boolean }) => void;
  clearFocus: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(focused);
  const [claimedByMe, setClaimedByMe] = useState(false);
  const [message, setMessage] = useState('');
  const [senderId, setSenderId] = useState<number | undefined>(r.senderEmailId ?? undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // When deep-linked (?reply=<id>), scroll to and expand this card once.
  useEffect(() => {
    if (focused && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setOpen(true);
    }
  }, [focused]);

  async function claim() {
    setBusy(true); setErr('');
    try { await api.inboxClaim(r.id); setClaimedByMe(true); setOpen(true); onChanged(); }
    catch (e) {
      const m = String(e);
      setErr(m.includes('409') ? 'Already claimed by another rep.' : 'Claim failed: ' + m);
    }
    setBusy(false);
  }

  async function send() {
    if (!message.trim()) return;
    setBusy(true); setErr('');
    try { await api.inboxReply(r.id, { message, senderEmailId: senderId }); setMessage(''); onChanged(); }
    catch (e) {
      const m = String(e);
      setErr(m.includes('422') ? 'Can’t reply in-app for this one — open it in Bison instead.' : 'Send failed: ' + m);
    }
    setBusy(false);
  }

  const [refStatus, setRefStatus] = useState(r.referralStatus);
  const [refBusy, setRefBusy] = useState(false);
  async function referral(action: 'add' | 'dismiss') {
    setRefBusy(true); setErr('');
    try { const d = await api.inboxReferral(r.id, action); setRefStatus(d.referralStatus); onChanged(); }
    catch (e) { setErr('Referral action failed: ' + String(e)); }
    setRefBusy(false);
  }

  const isClaimed = !!r.claimedBy || claimedByMe;
  const canReplyInApp = !!r.bisonReplyExtId && !!r.leadEmail;

  return (
    <div
      ref={ref}
      className="panel"
      style={{
        borderLeft: `3px solid ${focused ? 'var(--accent, #4f8cff)' : r.isPositive ? 'var(--green)' : 'var(--border)'}`,
        opacity: r.status === 'handled' ? 0.6 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <div>
          <strong>{r.leadName || r.leadEmail || 'Unknown'}</strong>
          {r.leadEmail && r.leadName && <span className="muted"> · {r.leadEmail}</span>}
          {r.isPositive && <span className="tag deliverable" style={{ marginLeft: 8 }}>{r.sentiment ?? 'positive'}</span>}
          {r.status !== 'new' && <span className="tag unknown" style={{ marginLeft: 6 }}>{r.status}</span>}
          {r.assignedRep && !isClaimed && <span className="muted" style={{ marginLeft: 8 }}>→ {r.assignedRep}</span>}
          {isClaimed && <span className="tag" style={{ marginLeft: 6 }}>claimed</span>}
        </div>
        <span className="muted" style={{ fontSize: 13 }}>{new Date(r.receivedAt).toLocaleString()}</span>
      </div>
      {r.subject && <div style={{ fontWeight: 600, marginTop: 6 }}>{r.subject}</div>}
      {r.body && <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>{r.body}</div>}

      {r.triageStrategy && (
        <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--bg-subtle, #f5f7fa)', borderRadius: 6, fontSize: 14 }}>
          💡 <strong>Suggested strategy:</strong> {r.triageStrategy}
          {r.triageCategory && <span className="tag unknown" style={{ marginLeft: 8 }}>{r.triageCategory}</span>}
        </div>
      )}

      {r.referral && (
        <div style={{ marginTop: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 6 }}>
          <div style={{ fontSize: 14 }}>
            🔁 <strong>Referral captured</strong> — contact instead:{' '}
            {[r.referral.name, r.referral.title].filter(Boolean).join(', ')}
            {(r.referral.name || r.referral.title) && ' · '}
            <span style={{ fontWeight: 600 }}>{r.referral.email}</span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {r.referral.inferredName && 'Name inferred from email. '}
            {r.referral.sameDomain ? 'Same company domain.' : 'Different domain — check before adding.'}
            {r.referralLeadId ? ' Lead created in Bison, not yet in the campaign.' : ' Lead not auto-created — add manually in Bison.'}
          </div>
          <div className="toolbar" style={{ marginTop: 8, marginBottom: 0, gap: 8 }}>
            {refStatus === 'added' ? (
              <span className="tag deliverable">Added to campaign</span>
            ) : refStatus === 'dismissed' ? (
              <span className="tag unknown">Dismissed</span>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => referral('add')} disabled={refBusy || !r.referralLeadId || !r.campaignId}>
                  {refBusy ? 'Working…' : 'Add to campaign'}
                </button>
                <button className="btn" onClick={() => referral('dismiss')} disabled={refBusy}>Dismiss</button>
                {!r.campaignId && <span className="muted" style={{ fontSize: 12 }}>No linked campaign — add manually in Bison.</span>}
              </>
            )}
          </div>
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 12, marginBottom: 0, gap: 8 }}>
        {!isClaimed && <button className="btn btn-primary" onClick={claim} disabled={busy}>Claim &amp; reply</button>}
        {isClaimed && !open && <button className="btn btn-primary" onClick={() => setOpen(true)}>Reply</button>}
        {!canReplyInApp && (
          <span className="muted" style={{ fontSize: 13 }}>No Bison thread id — open in Bison to respond.</span>
        )}
        {!r.isPositive && <button className="btn" onClick={() => onAct(r, { markInterested: true })}>Mark interested</button>}
        {r.status !== 'handled' && <button className="btn" onClick={() => onAct(r, { status: 'handled' })}>Mark handled</button>}
        {focused && <button className="btn" onClick={clearFocus}>Dismiss highlight</button>}
      </div>

      {isClaimed && open && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          {canReplyInApp ? (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <label className="muted" style={{ fontSize: 13 }}>Reply from</label>
                <select value={senderId ?? ''} onChange={(e) => setSenderId(e.target.value ? Number(e.target.value) : undefined)}>
                  <option value="">{r.senderEmailId ? `Original inbox (#${r.senderEmailId})` : 'Select sender inbox…'}</option>
                  {senders.map((s) => <option key={s.id} value={s.id}>{s.email}</option>)}
                </select>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={`Reply to ${r.leadName || r.leadEmail}…`}
                rows={5}
                style={{ width: '100%', resize: 'vertical' }}
              />
              <div className="toolbar" style={{ marginTop: 8, marginBottom: 0 }}>
                <button className="btn btn-primary" onClick={send} disabled={busy || !message.trim()}>
                  {busy ? 'Sending…' : 'Send reply'}
                </button>
              </div>
            </>
          ) : (
            <p className="muted">No Bison thread id — open it in the Bison master inbox to respond.</p>
          )}
          {err && <p className="muted" style={{ color: 'var(--red, #d33)' }}>{err}</p>}
        </div>
      )}
    </div>
  );
}
