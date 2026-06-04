import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type OutboundCampaign } from '../api.js';

/** Outbound Engine home — what this workspace does + a quick campaign roll-up. */
export function OutboundOverview() {
  const [campaigns, setCampaigns] = useState<OutboundCampaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.outboundCampaigns().then((d) => setCampaigns(d.campaigns)).finally(() => setLoading(false)); }, []);

  const active = campaigns.filter((c) => c.status === 'active').length;

  return (
    <>
      <h1 className="page-title">GTM <em>Outbound</em> Engine</h1>
      <p className="page-sub">
        Design, launch, and compare cold-email campaigns on top of the clean, segmented data from the
        Data Engine. Email Bison sends; this workspace is where you build the strategy and watch it learn.
      </p>

      <div className="cards">
        <div className="card"><div className="num">{loading ? '…' : campaigns.length}</div><div className="label">Campaigns</div></div>
        <div className="card"><div className="num">{loading ? '…' : active}</div><div className="label">Active</div></div>
        <div className="card"><div className="num" style={{ fontSize: 24 }}>Email Bison</div><div className="label">Channel</div></div>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Get started</h3>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
          <Link to="/campaigns/new" className="btn btn-primary">Build a campaign</Link>
          <Link to="/campaigns" className="btn">View campaigns</Link>
        </div>
        <p className="muted" style={{ marginTop: 14, lineHeight: 1.7 }}>
          The builder walks you through naming, a sending schedule, sender inboxes, the email sequence
          (with delays and A/B variants), and the audience — pulled live from the Data Engine and gated
          to deliverable addresses only. Preview before it creates anything in Bison; confirm before launch.
        </p>
      </div>
    </>
  );
}
