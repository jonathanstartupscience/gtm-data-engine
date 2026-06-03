import { useEffect, useState } from 'react';
import { api, postStream, type TaxonomyType } from '../api.js';

const PERSONAS = ['', 'ESO Leadership', 'ESO Program', 'ESO Partnerships', 'ESO Founder/GP'];

export function Campaigns() {
  const [campaigns, setCampaigns] = useState<{ id: number; name: string }[]>([]);
  const [campaignsErr, setCampaignsErr] = useState('');
  const [campaignId, setCampaignId] = useState<number | ''>('');
  const [persona, setPersona] = useState('');
  const [subType, setSubType] = useState('');
  const [types, setTypes] = useState<TaxonomyType[]>([]);
  const [count, setCount] = useState<number | null>(null);
  const [pushing, setPushing] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.bisonCampaigns().then((d) => setCampaigns(d.campaigns)).catch((e) => setCampaignsErr(String(e)));
    api.taxonomy().then((d) => setTypes(d.types));
  }, []);

  useEffect(() => {
    setCount(null);
    const t = setTimeout(() => api.bisonSegmentCount(persona, subType).then((d) => setCount(d.count)), 200);
    return () => clearTimeout(t);
  }, [persona, subType]);

  const allSubTypes = types.flatMap((t) => t.subTypes.map((s) => s.value));

  async function push() {
    if (!campaignId) return;
    setPushing(true); setLog([]); setResult(null);
    await postStream('/api/bison/push',
      { confirm: true, campaignId, persona: persona || undefined, subType: subType || undefined },
      (ev, data) => {
        if (ev === 'log') setLog((l) => [...l, (data as { message: string }).message]);
        else if (ev === 'done') setResult((data as { stats: Record<string, unknown> }).stats);
        else if (ev === 'error') setLog((l) => [...l, '✗ ' + (data as { message: string }).message]);
      });
    setPushing(false);
  }

  return (
    <>
      <h1 className="page-title">Email Bison</h1>
      <p className="page-sub">Send a campaign-ready segment to a cold-email campaign. Only deliverable and risky catch-all addresses are included — role-based, undeliverable, and unverified contacts are automatically excluded.</p>

      {campaignsErr && (
        <div className="panel" style={{ marginBottom: 16, color: 'var(--coral)' }}>
          Couldn’t load campaigns: {campaignsErr}. Check the Email Bison API key and instance URL in Logs &amp; Health.
        </div>
      )}

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>1 · Choose a campaign</h3>
        <select className="select" value={campaignId} onChange={(e) => setCampaignId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">Select a campaign…</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>2 · Choose who to send to</h3>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <select className="select" value={persona} onChange={(e) => setPersona(e.target.value)}>
            {PERSONAS.map((p) => <option key={p} value={p}>{p || 'All personas'}</option>)}
          </select>
          <select className="select" value={subType} onChange={(e) => setSubType(e.target.value)}>
            <option value="">All sub-types</option>
            {allSubTypes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <p style={{ marginTop: 14, fontSize: 15 }}>
          {count === null ? 'Counting…' : <><strong>{count.toLocaleString()}</strong> campaign-ready contacts match this segment.</>}
        </p>
      </div>

      <div className="panel">
        <h3>3 · Send</h3>
        {!result ? (
          <>
            <button className="btn btn-primary" disabled={!campaignId || pushing || !count}
              onClick={push}>
              {pushing ? 'Sending…' : `Send ${count?.toLocaleString() ?? ''} contacts to campaign`}
            </button>
            {!campaignId && <p className="muted" style={{ marginTop: 8 }}>Select a campaign first.</p>}
            {pushing && <p className="muted" style={{ marginTop: 8 }}><span className="spinner" /> Safe to leave — runs on the server.</p>}
            {log.length > 0 && (
              <details open style={{ marginTop: 12 }}><summary className="muted">Live activity</summary>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.7, maxHeight: 180, overflow: 'auto', marginTop: 8 }}>
                  {log.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              </details>
            )}
          </>
        ) : (
          <div style={{ borderLeft: '3px solid var(--green)', paddingLeft: 12 }}>
            <p style={{ fontSize: 15 }}>
              Sent to Email Bison: <strong>{Number(result.created ?? 0).toLocaleString()}</strong> leads created,{' '}
              {Number(result.attached ?? 0).toLocaleString()} attached to the campaign
              {Number(result.failed ?? 0) > 0 && <>, {Number(result.failed).toLocaleString()} failed</>}.
            </p>
            <button className="btn" onClick={() => setResult(null)}>Send another</button>
          </div>
        )}
      </div>
    </>
  );
}
