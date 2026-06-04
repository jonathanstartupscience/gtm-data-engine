import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CampaignPerf } from '../api.js';

const pct = (n: number) => (n * 100).toFixed(1) + '%';

/** Cross-campaign performance — compare reply/open/bounce rates + positive replies side by side. */
export function Performance() {
  const [rows, setRows] = useState<CampaignPerf[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.performance().then((d) => setRows(d.campaigns)).finally(() => setLoading(false)); }, []);

  const totals = rows.reduce((a, r) => ({
    sent: a.sent + r.sent, replies: a.replies + r.replies, positive: a.positive + r.positiveReplies, interested: a.interested + r.interested,
  }), { sent: 0, replies: 0, positive: 0, interested: 0 });

  return (
    <>
      <h1 className="page-title">Email <em>Engine</em></h1>
      <p className="page-sub">
        Design, launch, and compare cold-email campaigns on top of the clean, segmented data from the
        Data Engine. Below is how every campaign is performing — refresh a campaign’s stats from its
        detail page; positive replies are counted from the Inbox.
      </p>

      <div className="toolbar">
        <Link to="/campaigns/new" className="btn btn-primary">Build a campaign</Link>
        <Link to="/campaigns" className="btn">Campaigns</Link>
        <Link to="/sequences" className="btn">Sequences</Link>
        <Link to="/inbox" className="btn">Inbox</Link>
      </div>

      <div className="cards">
        <div className="card"><div className="num">{totals.sent.toLocaleString()}</div><div className="label">Total sent</div></div>
        <div className="card"><div className="num">{totals.replies.toLocaleString()}</div><div className="label">Replies</div></div>
        <div className="card"><div className="num">{totals.positive.toLocaleString()}</div><div className="label">Positive replies</div></div>
        <div className="card"><div className="num">{totals.interested.toLocaleString()}</div><div className="label">Interested</div></div>
      </div>

      {loading ? <div className="loading">Loading…</div> : rows.length === 0 ? (
        <div className="panel"><p className="muted">No campaigns yet.</p></div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead><tr>
              <th>Campaign</th><th>Persona</th><th>Sent</th><th>Open rate</th>
              <th>Reply rate</th><th>Positive</th><th>Bounce rate</th><th>Status</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link to={`/campaigns/${r.id}`}>{r.name}</Link></td>
                  <td className="muted">{r.persona ?? '—'}</td>
                  <td>{r.sent.toLocaleString()}</td>
                  <td>{pct(r.openRate)}</td>
                  <td>{pct(r.replyRate)}</td>
                  <td>{r.positiveReplies > 0 ? <strong style={{ color: 'var(--green-deep)' }}>{r.positiveReplies}</strong> : 0}</td>
                  <td style={{ color: r.bounceRate > 0.03 ? 'var(--coral)' : undefined }}>{pct(r.bounceRate)}</td>
                  <td><span className="muted">{r.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
