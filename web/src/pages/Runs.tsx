import { useEffect, useRef, useState } from 'react';
import { api, authToken, type Run } from '../api.js';

interface RunStep { label: string; provider?: string; status: 'ok' | 'warn' | 'error' | 'info'; detail?: string; count?: number; }

// Map each platform to the domain we pull its favicon from.
const PROVIDER_DOMAIN: Record<string, string> = {
  'Ocean.io': 'ocean.io', Bouncer: 'usebouncer.com', Airscale: 'airscale.io',
  HubSpot: 'hubspot.com', 'Email Bison': 'emailbison.com', Heyreach: 'heyreach.io',
};
function ProviderIcon({ provider }: { provider?: string }) {
  if (!provider) return null;
  const domain = PROVIDER_DOMAIN[provider];
  if (!domain) { // Engine / internal — a small dot
    return <span style={{ width: 16, height: 16, borderRadius: 4, background: 'var(--accent-light)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--accent)' }}>⚙</span>;
  }
  return <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt={provider}
    width={16} height={16} style={{ borderRadius: 3, flexShrink: 0 }} />;
}

function RunDetail({ run, onClose }: { run: Run; onClose: () => void }) {
  const steps = (run.stats?._steps as RunStep[] | undefined) ?? [];
  const dur = run.finishedAt
    ? `${Math.max(0, Math.round((new Date(run.finishedAt).getTime() - new Date(run.startedAt).getTime()) / 1000))}s`
    : '—';
  const icon = (s: string) => (s === 'error' ? '✗' : s === 'warn' ? '⚠' : s === 'info' ? '·' : '✓');
  const color = (s: string) => (s === 'error' ? 'var(--coral)' : s === 'warn' ? '#8b5e00' : s === 'info' ? 'var(--text-muted)' : 'var(--green-deep)');
  // distinct platforms used in this run (for a prominent callout)
  const platforms = [...new Set(steps.map((s) => s.provider).filter((p): p is string => !!p && p !== 'Engine'))];
  return (
    <>
      <div className="help-overlay" onClick={onClose} />
      <div className="help-drawer">
        <button className="help-close" onClick={onClose}>×</button>
        <h2 style={{ textTransform: 'capitalize' }}>{run.kind.replace(/-/g, ' ')}</h2>
        <p className="muted">Run #{run.id} · {run.status} · {new Date(run.startedAt).toLocaleString()} · {dur}</p>

        {platforms.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 6px', padding: '10px 12px', background: 'var(--bg)', borderRadius: 8 }}>
            <span className="muted" style={{ fontSize: 13 }}>Platforms used:</span>
            {platforms.map((p) => (
              <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 500 }}>
                <ProviderIcon provider={p} /> {p}
              </span>
            ))}
          </div>
        )}

        <h4>Step-by-step</h4>
        {steps.length === 0 && <p className="muted">No step detail recorded for this run (older run).</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '11px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
              <span style={{ color: color(s.status), fontWeight: 700, width: 14 }}>{icon(s.status)}</span>
              <ProviderIcon provider={s.provider} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{s.label}</div>
                {s.detail && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{s.detail}</div>}
              </div>
              {typeof s.count === 'number' && <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{s.count}</span>}
            </div>
          ))}
        </div>

        <details style={{ marginTop: 20 }}>
          <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>Show raw result data</summary>
          <pre style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, fontSize: 12, overflow: 'auto', marginTop: 8 }}>
            {JSON.stringify(run.stats, (k, v) => (k === '_steps' ? undefined : v), 2)}
          </pre>
        </details>
      </div>
    </>
  );
}

interface Recipe { id: string; name: string; desc: string; testLimit?: number; testLabel?: string; }
const RECIPES: Recipe[] = [
  {
    id: 'pull-hubspot-companies',
    name: 'Pull companies from HubSpot',
    desc: 'Import companies from HubSpot into the store — every Type and Sub-type. This is what makes the engine cover your whole CRM (not just ESO). Deduped against what you already have. Run the test first, then the full pull.',
    testLimit: 500, testLabel: 'Test (500)',
  },
  {
    id: 'pull-hubspot-contacts',
    name: 'Pull contacts from HubSpot',
    desc: 'Import people from HubSpot into the store, associated to their company. Run the company pull first so contacts can link up. Deduped by email. Run the test first, then the full pull.',
    testLimit: 500, testLabel: 'Test (500)',
  },
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
  const [detail, setDetail] = useState<Run | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  const loadHistory = () => api.runs().then((d) => setHistory(d.rows));
  const openRun = (id: number) => api.run(id).then((d) => setDetail(d.run));
  useEffect(() => { loadHistory(); }, []);
  useEffect(() => { logEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [log]);

  async function run(recipe: string, dryRun: boolean, limit?: number) {
    setRunning(recipe); setLog([]); setResult(null);
    const token = await authToken();
    let qs = `dryRun=${dryRun ? 1 : 0}${token ? `&token=${encodeURIComponent(token)}` : ''}`;
    if (limit) qs += `&limit=${limit}`;
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
              {r.testLimit ? (
                <>
                  <button className="btn" disabled={!!running} onClick={() => run(r.id, false, r.testLimit)}>{r.testLabel ?? 'Test'}</button>
                  <button className="btn btn-primary" disabled={!!running}
                    onClick={() => run(r.id, false)}>{running === r.id ? 'Running…' : 'Full pull'}</button>
                </>
              ) : (
                <>
                  <button className="btn" disabled={!!running} onClick={() => run(r.id, true)}>Dry run</button>
                  <button className="btn btn-primary" disabled={!!running}
                    onClick={() => run(r.id, false)}>{running === r.id ? 'Running…' : 'Run'}</button>
                </>
              )}
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
        <p className="muted" style={{ marginTop: -8 }}>Click any run to see the full step-by-step breakdown.</p>
        <table>
          <thead><tr><th>#</th><th>Recipe</th><th>Status</th><th>Started</th><th>Summary</th></tr></thead>
          <tbody>
            {history.map((r) => (
              <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openRun(r.id)}>
                <td className="muted">{r.id}</td>
                <td><a onClick={(e) => { e.preventDefault(); openRun(r.id); }}>{r.kind}</a></td>
                <td><span className={`tag ${r.status === 'done' ? 'deliverable' : r.status === 'error' ? 'undeliverable' : 'unknown'}`}>{r.status}</span></td>
                <td className="muted">{new Date(r.startedAt).toLocaleString()}</td>
                <td className="muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {summarize(r.stats)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && <RunDetail run={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

/** One-line human summary of a run's stats (the headline number, no JSON dump). */
function summarize(stats: Record<string, unknown> | null): string {
  if (!stats) return '';
  if (stats.dryRun) return `dry run · ${stats.candidates ?? 0} candidates`;
  if (stats.planGated) return 'Ocean plan upgrade needed';
  if (typeof stats.verified === 'number') return `${stats.verified} emails verified`;
  if (typeof stats.enriched === 'number') return `${stats.enriched} companies enriched, ${stats.filledFields ?? 0} fields`;
  if (typeof stats.newCompanies === 'number') return `${stats.newCompanies} new companies found`;
  if (typeof stats.resolved === 'number') return `${stats.resolved} records imported`;
  if (stats.error) return `error: ${String(stats.error).slice(0, 60)}`;
  return '';
}
