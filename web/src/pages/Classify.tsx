import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, authToken, type Proposal } from '../api.js';
import { refreshTaxonomy } from '../hooks/useTaxonomy.js';
import { DomainLink } from '../components/Table.js';

export function Classify() {
  const [audit, setAudit] = useState<{ missingTaxonomy: number; pendingProposals: number; canRunInApp: boolean } | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [minConf, setMinConf] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // In-app classifier run
  const [runLimit, setRunLimit] = useState(50);
  const [useOcean, setUseOcean] = useState(false);
  const [runningClassify, setRunningClassify] = useState(false);
  const [runLog, setRunLog] = useState<string[]>([]);

  const load = () => {
    api.classifyAudit().then(setAudit);
    api.classifyProposals(minConf).then((d) => { setProposals(d.proposals); setSelected(new Set(d.proposals.map((p) => p.id))); });
  };
  useEffect(load, [minConf]);

  async function runClassifier() {
    setRunningClassify(true); setRunLog([]);
    const token = await authToken();
    const qs = `limit=${runLimit}&ocean=${useOcean ? 1 : 0}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    const es = new EventSource(`/api/classify/run?${qs}`);
    es.addEventListener('log', (e) => setRunLog((l) => [...l, JSON.parse(e.data).message]));
    es.addEventListener('done', (e) => {
      const r = JSON.parse(e.data);
      setRunLog((l) => [...l, `✓ ${r.proposed} proposals written, ${r.errors} errors`]);
      es.close(); setRunningClassify(false); load();
    });
    es.addEventListener('error', (e) => {
      const data = (e as MessageEvent).data;
      if (data) setRunLog((l) => [...l, '✗ ' + JSON.parse(data).message]);
      else setRunLog((l) => [...l, '… stream ended (run continues server-side; refresh proposals shortly)']);
      es.close(); setRunningClassify(false); setTimeout(load, 3000);
    });
  }

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const confColor = (c: number | null) => (c == null ? 'var(--text-muted)' : c >= 0.85 ? 'var(--green-deep)' : c >= 0.6 ? '#8b5e00' : 'var(--coral)');

  async function decide(kind: 'approve' | 'reject') {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true); setMsg('');
    const r = await api.classifyDecide(kind === 'approve' ? ids : [], kind === 'reject' ? ids : []);
    if (kind === 'approve') {
      const hs = !r.hubspotConfigured ? ' (HubSpot not connected — store only)'
        : ` and synced ${r.hubspotSynced} to HubSpot${r.hubspotFailed ? `, ${r.hubspotFailed} failed` : ''}`;
      setMsg(`Applied ${r.applied} classifications${hs}.`);
    } else setMsg(`Dismissed ${r.rejected} proposals.`);
    setBusy(false); load();
    if (kind === 'approve') refreshTaxonomy(); // types/sub-types changed → update dropdown counts everywhere
  }

  return (
    <>
      <h1 className="page-title">Classify <em>review</em></h1>
      <p className="page-sub">AI-proposed type &amp; sub-type for companies missing them. Review and approve — nothing is applied until you confirm. Approving writes the classification to this store <strong>and back to HubSpot</strong> (for companies linked to a HubSpot record), so your CRM gets cleaned too.</p>

      {audit && (
        <div className="cards">
          <div className="card"><div className="num">{audit.missingTaxonomy.toLocaleString()}</div><div className="label">Companies missing type/sub-type</div></div>
          <div className="card"><div className="num">{audit.pendingProposals.toLocaleString()}</div><div className="label">Proposals awaiting review</div></div>
        </div>
      )}

      {/* Run the classifier in-app */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Generate proposals</h3>
        {audit && !audit.canRunInApp ? (
          <p className="muted">
            To run the AI classifier from here, add an <code>ANTHROPIC_API_KEY</code> in <Link to="/settings">Settings</Link>.
            (Or run <code>npm run classify</code> locally — that uses Claude Code at no API cost.)
          </p>
        ) : (
          <>
            <p className="muted" style={{ marginTop: -4 }}>Reads each company’s homepage and proposes a Type/Sub-type from the ICP taxonomy. Proposals land below for your review — nothing is applied automatically.</p>
            <div className="toolbar" style={{ marginBottom: 0, alignItems: 'center' }}>
              <label className="muted">How many:
                <select className="select" value={runLimit} onChange={(e) => setRunLimit(Number(e.target.value))} style={{ marginLeft: 6 }}>
                  {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={useOcean} onChange={(e) => setUseOcean(e.target.checked)} />
                <span className="muted">Use Ocean when a homepage is thin (costs credits)</span>
              </label>
              <button className="btn btn-primary" disabled={runningClassify} onClick={runClassifier}>
                {runningClassify ? <><span className="spinner" /> Classifying…</> : 'Run classifier'}
              </button>
            </div>
            {runLog.length > 0 && (
              <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.7, maxHeight: 160, overflow: 'auto', marginTop: 12 }}>
                {runLog.map((l, i) => <div key={i}>{l}</div>)}
              </div>
            )}
          </>
        )}
      </div>

      <div className="toolbar">
        <label className="muted">Show confidence ≥</label>
        <select className="select" value={minConf} onChange={(e) => setMinConf(Number(e.target.value))}>
          <option value={0}>All</option><option value={0.6}>0.60+</option>
          <option value={0.8}>0.80+</option><option value={0.9}>0.90+ (high confidence)</option>
        </select>
        <span className="muted">{selected.size} selected</span>
        <button className="btn btn-primary" disabled={busy || !selected.size} onClick={() => decide('approve')}>Approve &amp; apply {selected.size}</button>
        <button className="btn" disabled={busy || !selected.size} onClick={() => decide('reject')}>Dismiss {selected.size}</button>
      </div>
      {msg && <div className="panel" style={{ marginBottom: 16, borderLeft: '3px solid var(--green)' }}>{msg}</div>}

      {proposals.length === 0 ? (
        <div className="loading">No pending proposals yet. Use “Generate proposals” above to create some.</div>
      ) : (
        <table>
          <thead><tr>
            <th><input type="checkbox" checked={selected.size === proposals.length}
              onChange={(e) => setSelected(e.target.checked ? new Set(proposals.map((p) => p.id)) : new Set())} /></th>
            <th>Company</th><th>Proposed</th><th>Confidence</th><th>Why</th>
          </tr></thead>
          <tbody>
            {proposals.map((p) => (
              <tr key={p.id}>
                <td><input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} /></td>
                <td>{p.name}<div style={{ fontSize: 12 }}><DomainLink domain={p.domain} /></div></td>
                <td><span className="tag persona">{p.type}</span> <span className="tag persona">{p.subType}</span></td>
                <td style={{ color: confColor(p.confidence), fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                  {p.confidence == null ? '—' : `${Math.round(p.confidence * 100)}%`}
                </td>
                <td className="muted" style={{ fontSize: 13, maxWidth: 380 }}>{p.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
