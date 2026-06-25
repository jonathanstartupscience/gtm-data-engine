import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type LiCampaign } from '../api.js';

/** LinkedIn Engine landing — status + campaign roll-up. Shows a clear setup state when no key. */
export function LinkedInOverview() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [keyValid, setKeyValid] = useState<boolean | undefined>();
  const [campaigns, setCampaigns] = useState<LiCampaign[]>([]);

  useEffect(() => {
    api.liStatus().then((s) => { setConfigured(s.configured); setKeyValid(s.keyValid); }).catch(() => setConfigured(false));
    api.liCampaigns().then((d) => setCampaigns(d.campaigns)).catch(() => {});
  }, []);

  return (
    <>
      <h1 className="page-title">LinkedIn <em>Engine</em></h1>
      <p className="page-sub">
        LinkedIn outreach via HeyReach. Build campaigns in HeyReach; mirror them here, push clean
        LinkedIn segments into active campaigns, and track replies and performance.
      </p>

      {configured === false && (
        <div className="panel" style={{ marginBottom: 16, borderLeft: '3px solid var(--amber)' }}>
          <h3 style={{ marginTop: 0 }}>Not connected yet</h3>
          <p style={{ lineHeight: 1.7 }}>
            Add your HeyReach API key in <Link to="/settings">Settings</Link> to turn this engine on
            (HeyReach → Settings → API). Takes effect immediately — no redeploy.
          </p>
          <Link to="/settings" className="btn btn-primary">Add HeyReach key</Link>
        </div>
      )}
      {configured && keyValid === false && (
        <div className="panel" style={{ marginBottom: 16, color: 'var(--coral)' }}>
          HeyReach key is set but didn’t validate. Check it in Railway.
        </div>
      )}

      <div className="cards">
        <div className="card"><div className="num">{configured === null ? '…' : configured ? (keyValid ? 'Connected' : 'Key set') : 'Off'}</div><div className="label">HeyReach</div></div>
        <div className="card"><div className="num">{campaigns.length}</div><div className="label">Campaigns mirrored</div></div>
        <div className="card"><div className="num">{campaigns.filter((c) => /progress|active/i.test(c.status ?? '')).length}</div><div className="label">Active</div></div>
      </div>

      <div className="panel">
        <h3>Get started</h3>
        <div className="toolbar" style={{ marginBottom: 0, marginTop: 10 }}>
          <Link to="/linkedin/campaigns" className="btn btn-primary">View campaigns</Link>
          <Link to="/linkedin/inbox" className="btn">Inbox</Link>
        </div>
        <p className="muted" style={{ marginTop: 14, lineHeight: 1.7 }}>
          Build the campaign and sequence in HeyReach, then <strong>Sync</strong> it here, push a
          LinkedIn-ready segment (contacts with a LinkedIn profile URL), and monitor conversations.
        </p>
      </div>
    </>
  );
}
