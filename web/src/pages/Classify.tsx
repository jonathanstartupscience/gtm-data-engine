import { useEffect, useState } from 'react';
import { api, type Proposal } from '../api.js';

export function Classify() {
  const [audit, setAudit] = useState<{ missingTaxonomy: number; pendingProposals: number } | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [minConf, setMinConf] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => {
    api.classifyAudit().then(setAudit);
    api.classifyProposals(minConf).then((d) => { setProposals(d.proposals); setSelected(new Set(d.proposals.map((p) => p.id))); });
  };
  useEffect(load, [minConf]);

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const confColor = (c: number | null) => (c == null ? 'var(--text-muted)' : c >= 0.85 ? 'var(--green-deep)' : c >= 0.6 ? '#8b5e00' : 'var(--coral)');

  async function decide(kind: 'approve' | 'reject') {
    const ids = [...selected];
    if (!ids.length) return;
    setBusy(true); setMsg('');
    const r = await api.classifyDecide(kind === 'approve' ? ids : [], kind === 'reject' ? ids : []);
    setMsg(kind === 'approve' ? `Applied ${r.applied} classifications to your companies.` : `Dismissed ${r.rejected} proposals.`);
    setBusy(false); load();
  }

  return (
    <>
      <h1 className="page-title">Classify <em>review</em></h1>
      <p className="page-sub">AI-proposed type &amp; sub-type for companies missing them. Review and approve — nothing is applied until you confirm. Run the classifier locally (npm run classify) to generate proposals.</p>

      {audit && (
        <div className="cards">
          <div className="card"><div className="num">{audit.missingTaxonomy.toLocaleString()}</div><div className="label">Companies missing type/sub-type</div></div>
          <div className="card"><div className="num">{audit.pendingProposals.toLocaleString()}</div><div className="label">Proposals awaiting review</div></div>
        </div>
      )}

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
        <div className="loading">No pending proposals. Run <code>npm run classify</code> locally to generate some.</div>
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
                <td>{p.name}<div className="muted" style={{ fontSize: 12 }}>{p.domain}</div></td>
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
