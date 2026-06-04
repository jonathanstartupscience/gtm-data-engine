import { useEffect, useState } from 'react';
import { api, postStream, type TaxonomyType } from '../api.js';

const PERSONAS = ['ESO Leadership', 'ESO Program', 'ESO Partnerships', 'ESO Founder/GP'];

export function FindContacts() {
  const [persona, setPersona] = useState('');
  const [subType, setSubType] = useState('');
  const [types, setTypes] = useState<TaxonomyType[]>([]);
  const [scope, setScope] = useState<{ candidates: number; estPeople: number; estCostUsd: number; vendor: string; what: string } | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => { api.taxonomy().then((d) => setTypes(d.types)); }, []);
  const allSubTypes = types.flatMap((t) => t.subTypes.map((s) => s.value));

  useEffect(() => {
    setScope(null);
    if (!persona) return;
    setScopeLoading(true);
    const t = setTimeout(() => {
      api.findContactsScope(persona, subType).then(setScope).finally(() => setScopeLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [persona, subType]);

  async function run() {
    setRunning(true); setLog([]); setResult(null);
    await postStream('/api/discover/find-contacts',
      { confirm: true, persona, subType: subType || undefined },
      (ev, data) => {
        if (ev === 'log') setLog((l) => [...l, (data as { message: string }).message]);
        else if (ev === 'done') setResult((data as { stats: Record<string, unknown> }).stats);
        else if (ev === 'error') setLog((l) => [...l, '✗ ' + (data as { message: string }).message]);
      });
    setRunning(false);
  }

  const cost = scope?.estCostUsd ?? 0;

  return (
    <>
      <h1 className="page-title">Find more <em>contacts</em></h1>
      <p className="page-sub">For companies missing a key person, discover the right contacts by role via Airscale — then verify their emails. The people-side counterpart to Find Companies.</p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>1 · Who are you looking for?</h3>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <select className="select" value={persona} onChange={(e) => setPersona(e.target.value)}>
            <option value="">Select a persona…</option>
            {PERSONAS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="select" value={subType} onChange={(e) => setSubType(e.target.value)}>
            <option value="">All sub-types</option>
            {allSubTypes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {persona && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <h3>2 · Scope &amp; cost</h3>
          {scopeLoading || !scope ? <p className="muted">Checking…</p> : (
            <>
              <p className="muted" style={{ marginTop: -8 }}>{scope.what}</p>
              <div className="cards" style={{ marginBottom: 0 }}>
                <div className="card"><div className="num">{scope.candidates.toLocaleString()}</div><div className="label">Companies missing this persona</div></div>
                <div className="card"><div className="num">~{scope.estPeople.toLocaleString()}</div><div className="label">People to source</div></div>
                <div className="card"><div className="num" style={{ color: cost >= 25 ? 'var(--coral)' : undefined }}>${cost < 1 ? cost.toFixed(2) : Math.round(cost)}</div><div className="label">Est. cost · {scope.vendor}</div></div>
              </div>
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-primary" disabled={running || scope.candidates === 0} onClick={run}>
                  {running ? 'Finding…' : `Find contacts · ~$${cost < 1 ? cost.toFixed(2) : Math.round(cost)}`}
                </button>
                {running && <span className="muted" style={{ marginLeft: 10 }}><span className="spinner" /> Safe to leave — runs on the server.</span>}
              </div>
            </>
          )}
        </div>
      )}

      {(log.length > 0 || result) && (
        <div className="panel">
          <h3>3 · Results</h3>
          {result && (
            <div className="cards" style={{ marginBottom: 12 }}>
              <div className="card"><div className="num">{Number(result.added ?? 0).toLocaleString()}</div><div className="label">People added</div></div>
              <div className="card"><div className="num">{Number(result.companies ?? 0).toLocaleString()}</div><div className="label">Companies searched</div></div>
            </div>
          )}
          <details open><summary className="muted">Activity</summary>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.7, maxHeight: 180, overflow: 'auto', marginTop: 8 }}>
              {log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </details>
        </div>
      )}
    </>
  );
}
