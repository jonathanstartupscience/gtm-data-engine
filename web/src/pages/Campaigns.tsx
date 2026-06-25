import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type OutboundCampaign } from '../api.js';

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
    api.outboundCampaigns().then((d) => setCampaigns(d.campaigns)).catch((e) => setErr(String(e))).finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function sync() {
    setSyncing(true); setErr(''); setNote('');
    try {
      const r = await api.outboundSync();
      setNote(`Synced ${r.synced} campaigns from Bison (${r.added} new, ${r.updated} updated).`);
      load();
    } catch (e) { setErr('Sync failed: ' + String(e) + ' — check the Email Bison key/instance URL on the Workspaces page.'); }
    setSyncing(false);
  }

  async function remove(c: OutboundCampaign) {
    if (!confirm(`Remove “${c.name}” from this workspace’s view? This deletes the app’s local copy only — it does NOT delete the campaign in Email Bison.`)) return;
    setErr(''); setNote('');
    try {
      await api.outboundDeleteCampaign(c.id);
      setNote(`Removed “${c.name}” from the app.`);
      load();
    } catch (e) { setErr('Delete failed: ' + String(e)); }
  }

  return (
    <>
      <h1 className="page-title">Campaigns</h1>
      <p className="page-sub">Your cold-email campaigns. Build one, or sync from Email Bison to track existing campaigns here.</p>

      <div className="toolbar">
        <Link to="/campaigns/new" className="btn btn-primary">+ New campaign</Link>
        <Link to="/experiments" className="btn">A/B experiments</Link>
        <button className="btn" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync from Bison'}</button>
      </div>

      {note && <div className="panel" style={{ marginBottom: 16, borderLeft: '3px solid var(--green)' }}>{note}</div>}
      {err && <div className="panel" style={{ marginBottom: 16, color: 'var(--coral)' }}>{err}</div>}

      {loading ? <div className="loading">Loading…</div> : campaigns.length === 0 ? (
        <div className="panel">
          <p>No campaigns yet. <Link to="/campaigns/new">Build your first campaign</Link> or sync from Bison.</p>
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
                  <td><button className="btn btn-sm" onClick={() => remove(c)} style={{ color: 'var(--coral)' }} title="Remove from this workspace (does not delete in Bison)">Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
