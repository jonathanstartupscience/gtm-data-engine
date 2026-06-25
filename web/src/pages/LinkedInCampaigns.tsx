import { useEffect, useState, useCallback } from 'react';
import { api, type LiCampaign } from '../api.js';
import { PageHeader, EmptyState } from '../components/PageHeader.js';

const PERSONAS = ['', 'ESO Leadership', 'ESO Program', 'ESO Partnerships', 'ESO Founder/GP'];
const STATUS_TAG: Record<string, string> = { IN_PROGRESS: 'deliverable', ACTIVE: 'deliverable', PAUSED: 'risky_catchall', DRAFT: 'unknown', FINISHED: 'role_based' };

export function LinkedInCampaigns() {
  const [configured, setConfigured] = useState(true);
  const [campaigns, setCampaigns] = useState<LiCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [note, setNote] = useState('');
  const [sel, setSel] = useState<number | null>(null);
  const [persona, setPersona] = useState('');
  const [count, setCount] = useState<number | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushMsg, setPushMsg] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.liCampaigns().then((d) => { setConfigured(d.configured); setCampaigns(d.campaigns); }).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    setCount(null);
    const t = setTimeout(() => api.liSegmentCount(persona, '').then((d) => setCount(d.count)).catch(() => setCount(null)), 250);
    return () => clearTimeout(t);
  }, [persona]);

  async function sync() {
    setSyncing(true); setNote('');
    try {
      const r = await api.liSync();
      if ('configured' in r && r.configured === false) setNote(r.message);
      else { const rr = r as { synced: number; added: number; updated: number }; setNote(`Synced ${rr.synced} campaigns (${rr.added} new).`); load(); }
    } catch (e) { setNote('Sync failed: ' + String(e)); }
    setSyncing(false);
  }

  async function push() {
    if (sel == null) return;
    setPushing(true); setPushMsg('');
    try {
      const { postStream } = await import('../api.js');
      await postStream(`/api/linkedin/campaigns/${sel}/push`, { confirm: true, persona: persona || undefined }, (ev, data) => {
        if (ev === 'log') setPushMsg((data as { message: string }).message);
        else if (ev === 'done') { const d = data as Record<string, number>; setPushMsg(`Done — ${d.added} added, ${d.updated} updated, ${d.failed} failed.`); }
        else if (ev === 'error') setPushMsg('✗ ' + (data as { message: string }).message);
      });
    } catch (e) { setPushMsg('✗ ' + String(e)); }
    setPushing(false);
  }

  return (
    <>
      <PageHeader title="LinkedIn Campaigns" sub="Mirror campaigns from HeyReach, then push a clean segment into an active one." />

      <div className="toolbar"><button className="btn" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync from HeyReach'}</button></div>
      {note && <div className="callout callout-info mb-4">{note}</div>}

      {!configured && (
        <div className="callout callout-warn mb-4">
          HeyReach isn’t connected. Add <code>HEYREACH_API_KEY</code> in Railway to sync and push.
        </div>
      )}

      {loading ? <div className="loading">Loading…</div> : campaigns.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="No campaigns yet"
            hint="Campaigns are built in HeyReach. Sync to mirror them here."
            action={<button className="btn btn-primary" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync from HeyReach'}</button>}
          />
        </div>
      ) : (
        <>
          <div className="panel mb-4" style={{ padding: 0, overflow: 'hidden' }}>
            <table>
              <thead><tr><th></th><th>Campaign</th><th>Status</th><th>HeyReach</th><th>Synced</th></tr></thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id}>
                    <td><input type="radio" name="licamp" checked={sel === c.id} onChange={() => setSel(c.id)} /></td>
                    <td>{c.name}</td>
                    <td><span className={'tag ' + (STATUS_TAG[c.status ?? ''] ?? 'unknown')}>{c.status ?? '—'}</span></td>
                    <td className="muted">#{c.heyreachCampaignId}</td>
                    <td className="muted">{new Date(c.syncedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <h3>Push a segment {sel != null ? '' : '— select a campaign above'}</h3>
            <div className="toolbar mb-2">
              <select className="select" value={persona} onChange={(e) => setPersona(e.target.value)}>
                {PERSONAS.map((p) => <option key={p} value={p}>{p || 'All personas'}</option>)}
              </select>
            </div>
            <p style={{ fontSize: 15 }}>
              {count === null ? <span className="muted">Counting…</span> : <><strong>{count.toLocaleString()}</strong> contacts have a LinkedIn profile URL{persona ? ` in ${persona}` : ''}.</>}
            </p>
            <button className="btn btn-primary" disabled={sel == null || pushing || !count} onClick={push}>
              {pushing ? <><span className="spinner" /> Pushing…</> : `Push ${count?.toLocaleString() ?? ''} to HeyReach`}
            </button>
            {pushMsg && <p className="muted" style={{ marginTop: 10 }}>{pushMsg}</p>}
            <p className="muted text-sm" style={{ marginTop: 10 }}>HeyReach only accepts leads into an <strong>active</strong> campaign.</p>
          </div>
        </>
      )}
    </>
  );
}
