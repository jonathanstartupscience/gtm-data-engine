import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type CampaignPerf } from '../api.js';
import { PageHeader, EmptyState } from '../components/PageHeader.js';

const pct = (n: number) => (n * 100).toFixed(1) + '%';

/** Cross-campaign performance — compare reply/open/bounce rates + positive replies side by side. */
export function Performance() {
  const [rows, setRows] = useState<CampaignPerf[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let on = true;
    // Show the last snapshot immediately, then pull fresh stats from Bison in the background and
    // reload so the numbers match Bison without a manual per-campaign refresh.
    api.performance().then((d) => { if (on) setRows(d.campaigns); }).finally(() => { if (on) setLoading(false); });
    setRefreshing(true);
    api.outboundRefreshAllStats()
      .then(() => api.performance())
      .then((d) => { if (on) setRows(d.campaigns); })
      .catch(() => {})
      .finally(() => { if (on) setRefreshing(false); });
    return () => { on = false; };
  }, []);

  const totals = rows.reduce((a, r) => ({
    sent: a.sent + r.sent, replies: a.replies + r.replies, positive: a.positive + r.positiveReplies, interested: a.interested + r.interested,
  }), { sent: 0, replies: 0, positive: 0, interested: 0 });

  return (
    <>
      <PageHeader
        title={<>Email <em>Engine</em></>}
        sub={refreshing
          ? <><span className="spinner" style={{ verticalAlign: 'middle', marginRight: 6 }} />Updating stats from Bison…</>
          : 'Live stats from Bison, refreshed on open; positive replies come from the Inbox.'}
        action={<Link to="/campaigns/new" className="btn btn-primary">Build a campaign</Link>}
      />

      <div className="toolbar bare">
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
        <div className="panel">
          <EmptyState
            title="No campaigns yet"
            hint="Stats appear here once a campaign starts sending."
            action={<Link to="/campaigns/new" className="btn btn-primary">Build a campaign</Link>}
          />
        </div>
      ) : (
        <div className="data-grid">
          <table>
            <thead><tr>
              <th>Campaign</th><th>Persona</th><th className="num">Sent</th><th className="num">Open rate</th>
              <th className="num">Reply rate</th><th className="num">Positive</th><th className="num">Bounce rate</th><th>Status</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><Link className="cell-primary" to={`/campaigns/${r.id}`}>{r.name}</Link></td>
                  <td className="muted">{r.persona ?? '—'}</td>
                  <td className="num">{r.sent.toLocaleString()}</td>
                  <td className="num">{pct(r.openRate)}</td>
                  <td className="num">{pct(r.replyRate)}</td>
                  <td className="num">{r.positiveReplies > 0 ? <strong style={{ color: 'var(--green-deep)' }}>{r.positiveReplies}</strong> : 0}</td>
                  <td className="num" style={{ color: r.bounceRate > 0.03 ? 'var(--coral)' : undefined }}>{pct(r.bounceRate)}</td>
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
