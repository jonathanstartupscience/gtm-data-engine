import { useEffect, useState } from 'react';
import { api, postStream } from '../api.js';

type Seed = { domain: string; name: string };

export function Discover() {
  const [subTypes, setSubTypes] = useState<{ sub: string; n: number }[]>([]);
  const [subType, setSubType] = useState('');
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [size, setSize] = useState(25);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => { api.subTypes().then((d) => setSubTypes(d.subTypes)); }, []);
  useEffect(() => {
    if (!subType) { setSeeds([]); setChosen(new Set()); return; }
    api.seeds(subType).then((d) => { setSeeds(d.seeds); setChosen(new Set(d.seeds.map((s) => s.domain))); });
  }, [subType]);

  function toggle(domain: string) {
    setChosen((c) => { const n = new Set(c); n.has(domain) ? n.delete(domain) : n.add(domain); return n; });
  }

  async function run() {
    setBusy(true); setLog([]); setResult(null);
    await postStream('/api/discover/run',
      { seedDomains: [...chosen], subType: subType || undefined, size },
      (ev, data) => {
        if (ev === 'log') setLog((l) => [...l, (data as { message: string }).message]);
        else if (ev === 'done') { setResult((data as { stats: Record<string, unknown> }).stats); }
        else if (ev === 'error') setLog((l) => [...l, '✗ ' + (data as { message: string }).message]);
      });
    setBusy(false);
  }

  const planGated = result?.planGated === true;

  return (
    <>
      <div className="eyebrow">Grow</div>
      <h1 className="page-title">Find more <em>companies</em></h1>
      <p className="page-sub">There are ~18,000 ESOs out there. Pick a type, choose examples you like, and Ocean finds similar companies to add to your targets — deduped against what you already have.</p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>1 · What kind of company are you looking for?</h3>
        <select className="select" value={subType} onChange={(e) => setSubType(e.target.value)}>
          <option value="">Choose a type…</option>
          {subTypes.map((s) => <option key={s.sub} value={s.sub}>{s.sub} ({s.n})</option>)}
        </select>
      </div>

      {seeds.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <h3>2 · Pick example companies to find lookalikes of</h3>
          <p className="muted" style={{ marginTop: -8 }}>We suggested a spread of your existing {subType} companies. Uncheck any you don't want to use as a reference.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {seeds.map((s) => (
              <label key={s.domain} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                border: '1px solid var(--border)', borderRadius: 8,
                background: chosen.has(s.domain) ? 'var(--accent-light)' : 'transparent', cursor: 'pointer',
              }}>
                <input type="checkbox" checked={chosen.has(s.domain)} onChange={() => toggle(s.domain)} />
                <span>{s.name || s.domain}</span>
              </label>
            ))}
          </div>
          <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
            <label className="muted">How many to find:</label>
            <select className="select" value={size} onChange={(e) => setSize(Number(e.target.value))}>
              {[10, 25, 50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="btn btn-primary" disabled={busy || chosen.size === 0} onClick={run}>
              {busy ? 'Searching…' : `Find ${size} similar companies`}
            </button>
          </div>
        </div>
      )}

      {(log.length > 0 || result) && (
        <div className="panel">
          <h3>3 · Results</h3>
          {planGated && (
            <div style={{ padding: 14, borderRadius: 8, background: 'rgba(212,168,67,0.15)', color: '#8b5e00', marginBottom: 12 }}>
              ⚠️ {String(result?.message ?? '')}
            </div>
          )}
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.7, maxHeight: 180, overflow: 'auto' }}>
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
          {result && !planGated && (
            <div className="cards" style={{ marginTop: 16, marginBottom: 0 }}>
              <div className="card"><div className="num">{String(result.newCompanies ?? 0)}</div><div className="label">New companies added</div></div>
              <div className="card"><div className="num">{String(result.alreadyKnown ?? 0)}</div><div className="label">Already in store</div></div>
              <div className="card"><div className="num">{String(result.found ?? 0)}</div><div className="label">Total found</div></div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
