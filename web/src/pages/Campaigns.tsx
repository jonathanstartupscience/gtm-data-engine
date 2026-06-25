import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type OutboundCampaign } from '../api.js';
import { PageHeader, EmptyState } from '../components/PageHeader.js';

const STATUS_TAG: Record<string, string> = {
  active: 'deliverable', paused: 'risky_catchall', created: 'role_based', draft: 'unknown', done: 'role_based',
};

/** Campaigns list — our stored campaign definitions, syncable from Bison. */
export function Campaigns() {
  const [campaigns, setCampaigns] = useState<OutboundCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [err, setErr] = useState('');
  const [note, setNote] = useState('');

  function load() {
    setLoading(true);
    api.outboundCampaigns().then((d) => setCampaigns(d.campaigns)).catch(() => setErr('Couldn’t load campaigns — reload the page, and check your connection if it persists.')).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function sync() {
    setSyncing(true); setErr(''); setNote('');
    try {
      const r = await api.outboundSync();
      setNote(`Synced ${r.synced} campaigns from Bison (${r.added} new, ${r.updated} updated).`);
      load();
    } catch { setErr('Couldn’t sync from Bison — check this workspace’s API key on Workspaces, then try again.'); }
    setSyncing(false);
  }

  async function remove(c: OutboundCampaign) {
    if (!confirm(`Remove “${c.name}” from this workspace’s view? This deletes the app’s local copy only — it does NOT delete the campaign in Email Bison.`)) return;
    setErr(''); setNote('');
    try {
      await api.outboundDeleteCampaign(c.id);
      setNote(`Removed “${c.name}” from the app.`);
      load();
    } catch { setErr(`Couldn’t remove “${c.name}” — reload and try again; the campaign in Bison is untouched.`); }
  }

  return (
    <>
      <PageHeader
        title="Campaigns"
        action={<Link to="/campaigns/new" className="btn btn-primary">New campaign</Link>}
      />

      <div className="toolbar">
        <Link to="/experiments" className="btn">A/B experiments</Link>
        <button className="btn" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync from Bison'}</button>
      </div>

      {note && <div className="callout callout-ok mb-4">{note}</div>}
      {err && <div className="callout callout-error mb-4">{err}</div>}

      {loading ? <div className="loading">Loading…</div> : campaigns.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="No campaigns yet"
            hint="Already running campaigns in Bison? Sync to pull them in."
            action={<Link to="/campaigns/new" className="btn btn-primary">New campaign</Link>}
          />
        </div>
      ) : (
        <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead><tr><th>Campaign</th><th>Status</th><th>Persona</th><th>Sub-type</th><th>In Bison</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td><Link to={`/campaigns/${c.id}`}>{c.name}</Link></td>
                  <td><span className={'tag ' + (STATUS_TAG[c.status] ?? 'unknown')}>{c.status}</span></td>
                  <td>{c.persona ?? <span className="muted">—</span>}</td>
                  <td>{c.subType ?? <span className="muted">—</span>}</td>
                  <td>{c.bisonCampaignId ? `#${c.bisonCampaignId}` : <span className="muted">not created</span>}</td>
                  <td className="muted">{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td><button className="btn btn-sm text-error" onClick={() => remove(c)} title="Remove from this workspace (does not delete in Bison)">Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
