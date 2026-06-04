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

function ScopeDialog({ scope, onCancel, onConfirm }:
  { scope: import('../api.js').Scope; onCancel: () => void; onConfirm: () => void }) {
  const cost = scope.estCostUsd;
  const big = cost >= 25;
  return (
    <>
      <div className="help-overlay" onClick={onCancel} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 51,
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        padding: 28, width: 480, maxWidth: '92vw', boxShadow: '0 12px 48px rgba(0,0,0,0.2)' }}>
        <h2 style={{ fontFamily: '"DM Serif Display", serif', fontWeight: 400, fontSize: 22, margin: '0 0 4px' }}>Before you run this</h2>
        <p className="muted" style={{ marginTop: 0 }}>{scope.what}</p>
        <div className="cards" style={{ margin: '16px 0', gridTemplateColumns: '1fr 1fr' }}>
          <div className="card">
            <div className="num">{scope.candidates < 0 ? '—' : scope.candidates.toLocaleString()}</div>
            <div className="label">{scope.candidates < 0 ? 'All records' : `${scope.unit} to process`}</div>
          </div>
          <div className="card">
            <div className="num" style={{ color: big ? 'var(--coral)' : undefined }}>
              {scope.free ? 'Free' : `$${cost < 1 ? cost.toFixed(2) : Math.round(cost).toLocaleString()}`}
            </div>
            <div className="label">{scope.free ? 'No vendor cost' : `Est. cost · ${scope.vendor}`}</div>
          </div>
        </div>
        {big && <p style={{ color: 'var(--coral)', fontSize: 13 }}>This is a larger spend — double-check before confirming.</p>}
        {scope.candidates === 0 && <p className="muted">Nothing to do — everything is already up to date.</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn btn-primary" disabled={scope.candidates === 0} onClick={onConfirm}>
            {scope.free ? 'Run' : `Confirm & spend ~$${scope.free ? 0 : (cost < 1 ? cost.toFixed(2) : Math.round(cost))}`}
          </button>
          <button className="btn" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </>
  );
}

interface Recipe { id: string; name: string; desc: string; testLimit?: number; testLabel?: string; }
const RECIPES: Recipe[] = [
  {
    id: 'pull-hubspot-companies',
    name: 'Import companies from HubSpot',
    desc: 'Pulls companies IN from HubSpot across all types and sub-types, deduplicated against existing records. (To push data back out to HubSpot, use Connectors → Sync to HubSpot.) Run a test batch first, then the full import.',
    testLimit: 500, testLabel: 'Test 500',
  },
  {
    id: 'pull-hubspot-contacts',
    name: 'Import contacts from HubSpot',
    desc: 'Pulls people IN from HubSpot and links them to their companies, deduplicated by email. Run the company import first.',
    testLimit: 500, testLabel: 'Test 500',
  },
  {
    id: 'verify-stale',
    name: 'Verify email deliverability',
    desc: 'Re-checks every email address that is unverified or older than 90 days through Bouncer. Fresh results are skipped, so no verification credits are wasted.',
  },
  {
    id: 'enrich-companies',
    name: 'Enrich company records',
    desc: 'Fills missing firmographics — employee size, founded year, industry — for companies with incomplete data, via Ocean.io. Existing values are never overwritten.',
  },
];

export function Runs() {
  const [history, setHistory] = useState<Run[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [runErr, setRunErr] = useState('');
  const [disconnected, setDisconnected] = useState(false);
  const [detail, setDetail] = useState<Run | null>(null);
  const [scope, setScope] = useState<import('../api.js').Scope | null>(null);
  const [scopeLoading, setScopeLoading] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const logEnd = useRef<HTMLDivElement>(null);

  // Open the scope/cost preview before running a credit-spending recipe.
  async function openScope(recipe: string) {
    setScopeLoading(recipe); setScope(null);
    try { setScope(await api.scope(recipe)); } finally { setScopeLoading(null); }
  }

  const loadHistory = () => api.runs().then((d) => setHistory(d.rows));
  const openRun = (id: number) => api.run(id).then((d) => setDetail(d.run));
  useEffect(() => { loadHistory(); }, []);
  useEffect(() => { logEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [log]);

  async function run(recipe: string, dryRun: boolean, limit?: number) {
    setRunning(recipe); setLog([]); setResult(null); setRunErr(''); setDisconnected(false);
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
      const data = (e as MessageEvent).data;
      if (data) {
        // A real server-emitted error.
        const msg = JSON.parse(data).message;
        setRunErr(msg); setLog((l) => [...l, `✗ ${msg}`]);
      } else {
        // Just the live stream dropping — the run continues server-side. Not a failure.
        setLog((l) => [...l, '… live view disconnected — the run is still going on the server. Check Recent activity for the final result.']);
        setDisconnected(true);
        setTimeout(loadHistory, 3000);
      }
      es.close(); setRunning(null); loadHistory();
    });
  }

  return (
    <>
      <h1 className="page-title">Workflows</h1>
      <p className="page-sub">Run a data operation. Use a test batch or dry run to preview before committing.</p>

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
                <button className="btn btn-primary" disabled={!!running || scopeLoading === r.id}
                  onClick={() => openScope(r.id)}>
                  {scopeLoading === r.id ? 'Checking…' : running === r.id ? 'Running…' : 'Review & run'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {scope && (
        <ScopeDialog
          scope={scope}
          onCancel={() => setScope(null)}
          onConfirm={() => { const r = scope.recipe; setScope(null); run(r, false); }}
        />
      )}

      {runErr && (
        <div className="panel" style={{ marginBottom: 16, borderLeft: '3px solid var(--coral)' }}>
          <strong style={{ color: 'var(--coral)' }}>This workflow failed.</strong>
          <div className="muted" style={{ marginTop: 4 }}>{runErr}</div>
          {/401|Authentication|credentials/i.test(runErr) && (
            <div className="muted" style={{ marginTop: 8 }}>
              Looks like a HubSpot auth problem — check the HubSpot token &amp; scopes on the{' '}
              <a href="/connectors/hubspot">HubSpot connector</a> page.
            </div>
          )}
        </div>
      )}

      {disconnected && (
        <div className="panel" style={{ marginBottom: 16, borderLeft: '3px solid var(--accent)' }}>
          <strong>Live view disconnected</strong>
          <div className="muted" style={{ marginTop: 4 }}>
            That’s expected on long runs — the workflow keeps running on the server. Its result will
            appear under <strong>Recent activity</strong> below (and in Logs &amp; Health) when it finishes.
            <button className="btn" style={{ marginLeft: 10, padding: '4px 10px' }} onClick={() => loadHistory()}>Refresh</button>
          </div>
        </div>
      )}

      {running && (
        <div className="panel" style={{ marginBottom: 16, borderLeft: '3px solid var(--green)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="spinner" /> <strong>Working…</strong>
            <span className="muted">This runs on the server — you can safely leave this page or close the tab.
              When you come back, find it under Recent activity below (or in Logs &amp; Health).</span>
          </div>
        </div>
      )}

      {(log.length > 0 || result) && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <h3>{result ? 'Result' : 'In progress'}</h3>
          {result && !running && (
            <div style={{ fontSize: 15, marginBottom: 12 }}>{friendlyResult(result)}</div>
          )}
          {result && (
            <div className="cards" style={{ marginBottom: 12 }}>
              {resultCards(result).map((c) => (
                <div className="card" key={c.label}><div className="num">{c.value}</div><div className="label">{c.label}</div></div>
              ))}
            </div>
          )}
          <details {...(result ? {} : { open: true })}>
            <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>
              {result ? 'Show activity log' : 'Live activity'}
            </summary>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.7, maxHeight: 240, overflow: 'auto', marginTop: 8 }}>
              {log.map((l, i) => <div key={i}>{l}</div>)}
              <div ref={logEnd} />
            </div>
          </details>
        </div>
      )}

      <div className="panel">
        <h3>Recent activity</h3>
        <p className="muted" style={{ marginTop: -8 }}>Select any run to see a detailed breakdown.</p>
        <table>
          <thead><tr><th>Workflow</th><th>Status</th><th>When</th><th>Result</th></tr></thead>
          <tbody>
            {history.map((r) => (
              <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openRun(r.id)}>
                <td><a onClick={(e) => { e.preventDefault(); openRun(r.id); }} style={{ textTransform: 'capitalize' }}>{r.kind.replace(/-/g, ' ').replace('hubspot', 'HubSpot')}</a></td>
                <td><span className={`tag ${r.status === 'done' ? 'deliverable' : r.status === 'error' ? 'undeliverable' : 'unknown'}`}>{r.status === 'done' ? 'Complete' : r.status === 'error' ? 'Failed' : r.status}</span></td>
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

/** A friendly one-sentence result for the just-finished run. */
function friendlyResult(s: Record<string, unknown>): string {
  if (s.planGated) return String(s.message ?? 'This step needs a plan upgrade.');
  if (s.dryRun) return `Preview only — ${num(s.candidates)} records would be processed. Nothing was changed.`;
  if (typeof s.verified === 'number') return `Checked ${num(s.verified)} email addresses for deliverability.`;
  if (typeof s.enriched === 'number') return `Filled in details for ${num(s.enriched)} companies (${num(s.filledFields)} data points added).`;
  if (typeof s.newCompanies === 'number') return `Found ${num(s.newCompanies)} new companies and added them to your data (${num(s.alreadyKnown)} were already there).`;
  if (typeof s.pulled === 'number') return `Imported ${num(s.resolved)} of ${num(s.pulled)} records from HubSpot into your data${s.capped ? ' (stopped at the test limit — run the full sync to bring in the rest)' : ''}.`;
  if (typeof s.resolved === 'number') return `Imported ${num(s.resolved)} records into your data.`;
  return 'Finished.';
}
function num(v: unknown): string { return Number(v ?? 0).toLocaleString(); }

/** Headline stat cards for a finished run. */
function resultCards(s: Record<string, unknown>): { label: string; value: string }[] {
  if (typeof s.pulled === 'number') return [
    { label: 'Pulled from HubSpot', value: num(s.pulled) },
    { label: 'Saved to your data', value: num(s.resolved) },
    { label: 'Issues', value: num(s.errors) },
  ];
  if (typeof s.enriched === 'number') return [
    { label: 'Companies enriched', value: num(s.enriched) },
    { label: 'Data points added', value: num(s.filledFields) },
    { label: 'Issues', value: num(s.errors) },
  ];
  if (typeof s.newCompanies === 'number') return [
    { label: 'New companies', value: num(s.newCompanies) },
    { label: 'Already known', value: num(s.alreadyKnown) },
    { label: 'Total found', value: num(s.found) },
  ];
  if (typeof s.verified === 'number') return [{ label: 'Emails checked', value: num(s.verified) }];
  return [];
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
