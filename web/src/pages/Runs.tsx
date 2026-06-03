import { useEffect, useRef, useState } from 'react';
import { api, authToken, type Run } from '../api.js';

interface Recipe { id: string; name: string; desc: string; }
const RECIPES: Recipe[] = [
  {
    id: 'verify-stale',
    name: 'Verify stale emails',
    desc: 'Find every email in the store missing or past its 90-day verification and re-check it through Bouncer. The continuous-hygiene workhorse.',
  },
  {
    id: 'enrich-companies',
    name: 'Enrich companies',
    desc: 'Fill in missing firmographics (employee size, founded year, industry) for companies that have a domain but incomplete data, using Ocean.io. Only fills gaps — never overwrites.',
  },
];

export function Runs() {
  const [history, setHistory] = useState<Run[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  const loadHistory = () => api.runs().then((d) => setHistory(d.rows));
  useEffect(() => { loadHistory(); }, []);
  useEffect(() => { logEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [log]);

  async function run(recipe: string, dryRun: boolean) {
    setRunning(recipe); setLog([]); setResult(null);
    const token = await authToken();
    const qs = `dryRun=${dryRun ? 1 : 0}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    const es = new EventSource(`/api/runs/stream/${recipe}?${qs}`);
    esRef.current = es;
    es.addEventListener('log', (e) => setLog((l) => [...l, JSON.parse(e.data).message]));
    es.addEventListener('done', (e) => {
      const r = JSON.parse(e.data);
      setResult(r.stats); setLog((l) => [...l, `✓ done (run #${r.runId})`]);
      es.close(); setRunning(null); loadHistory();
    });
    es.addEventListener('error', (e) => {
      const msg = (e as MessageEvent).data ? JSON.parse((e as MessageEvent).data).message : 'connection error';
      setLog((l) => [...l, `✗ ${msg}`]); es.close(); setRunning(null); loadHistory();
    });
  }

  return (
    <>
      <div className="eyebrow">Operate</div>
      <h1 className="page-title">Run a <em>flow</em></h1>
      <p className="page-sub">Pick a recipe and let the engine work. Dry-run first to preview — it’s always safe.</p>

      <div className="cards" style={{ gridTemplateColumns: '1fr' }}>
        {RECIPES.map((r) => (
          <div className="card" key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{r.name}</div>
              <div className="muted" style={{ marginTop: 4, maxWidth: 640 }}>{r.desc}</div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              <button className="btn" disabled={!!running} onClick={() => run(r.id, true)}>Dry run</button>
              <button className="btn btn-primary" disabled={!!running}
                onClick={() => run(r.id, false)}>{running === r.id ? 'Running…' : 'Run'}</button>
            </div>
          </div>
        ))}
      </div>

      {(log.length > 0 || result) && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <h3>Live output</h3>
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.7, maxHeight: 240, overflow: 'auto' }}>
            {log.map((l, i) => <div key={i}>{l}</div>)}
            <div ref={logEnd} />
          </div>
          {result && (
            <pre style={{ background: 'var(--panel-2)', padding: 12, borderRadius: 8, marginTop: 12, fontSize: 12, overflow: 'auto' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </div>
      )}

      <div className="panel">
        <h3>Run history</h3>
        <table>
          <thead><tr><th>#</th><th>Recipe</th><th>Status</th><th>Started</th><th>Result</th></tr></thead>
          <tbody>
            {history.map((r) => (
              <tr key={r.id}>
                <td className="muted">{r.id}</td>
                <td>{r.kind}</td>
                <td><span className={`tag ${r.status === 'done' ? 'deliverable' : r.status === 'error' ? 'undeliverable' : 'unknown'}`}>{r.status}</span></td>
                <td className="muted">{new Date(r.startedAt).toLocaleString()}</td>
                <td className="muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.stats ? JSON.stringify(r.stats) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
