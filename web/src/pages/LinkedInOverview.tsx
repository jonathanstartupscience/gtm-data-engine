import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type LiCampaign } from '../api.js';
import { PageHeader } from '../components/PageHeader.js';

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
      <PageHeader title={<>LinkedIn <em>Engine</em></>} sub="HeyReach outreach: mirror campaigns, push clean segments, track replies." />

      {configured === false && (
        <div className="callout callout-warn mb-4">
          <h3 style={{ marginTop: 0 }}>Not connected yet</h3>
          <p style={{ lineHeight: 1.7 }}>
            Add your HeyReach API key in <Link to="/settings">Settings</Link> to turn this engine on
            (HeyReach → Settings → API). Takes effect immediately — no redeploy.
          </p>
          <Link to="/settings" className="btn btn-primary">Add HeyReach key</Link>
        </div>
      )}
      {configured && keyValid === false && (
        <div className="panel text-error mb-4">
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
        <div className="toolbar mb-0" style={{ marginTop: 10 }}>
          <Link to="/linkedin/campaigns" className="btn btn-primary">View campaigns</Link>
          <Link to="/linkedin/inbox" className="btn">Inbox</Link>
        </div>
        <p className="muted" style={{ marginTop: 14, lineHeight: 1.7 }}>
          Build the campaign and sequence in HeyReach, sync it here, then push a segment — contacts
          with a LinkedIn profile URL — and watch conversations land in the Inbox.
        </p>
      </div>
    </>
  );
}
