import { useEffect, useRef, useState } from 'react';
import { api, authToken, type Run } from '../api.js';
import { refreshTaxonomy } from '../hooks/useTaxonomy.js';
import { CostBadge } from '../components/CostBadge.js';
import { PageHeader } from '../components/PageHeader.js';

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
        <button className="help-close" onClick={onClose} aria-label="Close run detail">×</button>
        <h2 style={{ textTransform: 'capitalize' }}>{run.kind.replace(/-/g, ' ')}</h2>
        <p className="muted">Run #{run.id} · {run.status} · {new Date(run.startedAt).toLocaleString()} · {dur}</p>

        {platforms.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 6px', padding: '10px 12px', background: 'var(--bg)', borderRadius: 8 }}>
            <span className="muted text-sm">Platforms used:</span>
            {platforms.map((p) => (
              <span key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 500 }}>
                <ProviderIcon provider={p} /> {p}
              </span>
            ))}
          </div>
        )}

        <h4>Step-by-step</h4>
        {steps.length === 0 && <p className="muted">No step detail recorded — this is an older run.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '11px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
              <span style={{ color: color(s.status), fontWeight: 700, width: 14 }}>{icon(s.status)}</span>
              <ProviderIcon provider={s.provider} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500 }}>{s.label}</div>
                {s.detail && <div className="muted text-sm" style={{ marginTop: 2 }}>{s.detail}</div>}
              </div>
              {typeof s.count === 'number' && <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{s.count}</span>}
            </div>
          ))}
        </div>

        <details style={{ marginTop: 20 }}>
          <summary className="muted text-sm" style={{ cursor: 'pointer' }}>Show raw result data</summary>
          <pre className="codeblock mt-2">
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
        <p className="muted mt-0">{scope.what}</p>
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
        {big && <p className="text-error text-sm">Larger spend — double-check before confirming.</p>}
        {scope.candidates === 0 && <p className="muted">Nothing to do — everything is up to date.</p>}
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

interface Recipe { id: string; name: string; desc: string; testLimit?: number; testLabel?: string; paid?: boolean; }
interface RecipeGroup { title: string; blurb: string; recipes: Recipe[]; }
const GROUPS: RecipeGroup[] = [
  {
    title: 'Import from HubSpot',
    blurb: 'Free — pulls data in from HubSpot. No vendor credits.',
    recipes: [
      {
        id: 'pull-hubspot-companies',
        name: 'Import companies from HubSpot',
        desc: 'Pulls companies in from HubSpot across all types and sub-types, deduplicated against existing records. To push back out, use Connectors → Sync to HubSpot. Run a test batch first, then the full import.',
        testLimit: 500, testLabel: 'Test 500',
      },
      {
        id: 'pull-hubspot-contacts',
        name: 'Import contacts from HubSpot',
        desc: 'Pulls people in from HubSpot and links them to their companies, deduplicated by email. Run the company import first.',
        testLimit: 500, testLabel: 'Test 500',
      },
    ],
  },
  {
    title: 'Bulk enrichment & verification (paid)',
    blurb: 'Spends vendor credits across all matching records. For a controlled spend, select specific rows on the Companies or Contacts tab and use the action bar there instead.',
    recipes: [
      {
        id: 'verify-stale',
        name: 'Verify all stale emails',
        desc: 'Re-checks every email that is unverified or older than 90 days through Bouncer; fresh results are skipped. Shows a cost preview before spending.',
        paid: true,
      },
      {
        id: 'enrich-companies',
        name: 'Enrich all incomplete companies',
        desc: 'Fills missing firmographics for every company with incomplete data, via Ocean.io; existing values are never overwritten. Shows a cost preview before spending.',
        paid: true,
      },
    ],
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
  // Per-recipe scoped cost for the card badges (real estimate, fetched up front for paid recipes).
  const [costs, setCosts] = useState<Record<string, number | null>>({});
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

  // Fetch the real scoped cost for each paid recipe so the card badge shows an accurate estimate
  // (not a placeholder). Refetched whenever a run finishes (candidate counts change).
  useEffect(() => {
    const paid = GROUPS.flatMap((g) => g.recipes).filter((r) => r.paid);
    let on = true;
    Promise.all(paid.map((r) => api.scope(r.id).then((s) => [r.id, s.estCostUsd] as const).catch(() => [r.id, null] as const)))
      .then((pairs) => { if (on) setCosts(Object.fromEntries(pairs)); });
    return () => { on = false; };
  }, [running]);
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
      es.close(); setRunning(null); loadHistory(); refreshTaxonomy();
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
      <PageHeader title="Workflows" sub="Paid bulk operations show a cost preview before spending. To target a precise spend, select rows on Companies/Contacts and use the action bar there." />

      {GROUPS.map((g) => (
        <div key={g.title} className="mb-6">
          <div className="row mb-1" style={{ gap: 10 }}>
            <h3 className="mt-0 mb-0">{g.title}</h3>
            {g.recipes.some((r) => r.paid) ? <CostBadge paid /> : <CostBadge costUsd={0} />}
          </div>
          <p className="muted text-sm mt-0 mb-3" style={{ maxWidth: 720 }}>{g.blurb}</p>
          <div className="task-list">
            {g.recipes.map((r) => (
              <div className="task-row" key={r.id}>
                <div className="task-main">
                  <div className="task-name">{r.name}</div>
                  <div className="task-desc" title={r.desc}>{r.desc}</div>
                </div>
                <div className="task-actions">
                  {/* Paid recipes keep their real per-recipe cost estimate inline; free ones don't repeat the badge. */}
                  {r.paid && <CostBadge costUsd={costs[r.id]} pending={!(r.id in costs)} />}
                  {r.testLimit ? (
                    <>
                      <button className="btn btn-sm" disabled={!!running} onClick={() => run(r.id, false, r.testLimit)}>{r.testLabel ?? 'Test'}</button>
                      <button className="btn btn-primary btn-sm" disabled={!!running}
                        onClick={() => run(r.id, false)}>{running === r.id ? 'Running…' : 'Full import'}</button>
                    </>
                  ) : (
                    <button className="btn btn-primary btn-sm" disabled={!!running || scopeLoading === r.id}
                      onClick={() => openScope(r.id)}>
                      {scopeLoading === r.id ? 'Checking…' : running === r.id ? 'Running…' : 'Review & run'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {scope && (
        <ScopeDialog
          scope={scope}
          onCancel={() => setScope(null)}
          onConfirm={() => { const r = scope.recipe; setScope(null); run(r, false); }}
        />
      )}

      {runErr && (
        <div className="callout callout-error mb-4">
          <strong className="text-error">This workflow failed.</strong>
          <div className="muted mt-1">{runErr}</div>
          {/401|Authentication|credentials/i.test(runErr) && (
            <div className="muted mt-2">
              Looks like a HubSpot auth problem — check the token &amp; scopes on the{' '}
              <a href="/connectors/hubspot">HubSpot connector</a> page.
            </div>
          )}
        </div>
      )}

      {disconnected && (
        <div className="callout callout-info mb-4">
          <strong>Live view disconnected</strong>
          <div className="muted mt-1">
            Expected on long runs — the workflow keeps running on the server. Its result appears under
            <strong> Recent activity</strong> below (and in Logs &amp; Health) when it finishes.
            <button className="btn btn-sm" style={{ marginLeft: 10 }} onClick={() => loadHistory()}>Refresh</button>
          </div>
        </div>
      )}

      {running && (
        <div className="callout callout-ok mb-4">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="spinner" /> <strong>Working…</strong>
            <span className="muted">Runs on the server — safe to leave this page or close the tab.
              Find it under Recent activity below (or in Logs &amp; Health) when you’re back.</span>
          </div>
        </div>
      )}

      {(log.length > 0 || result) && (
        <div className="panel mb-6">
          <h3>{result ? 'Result' : 'In progress'}</h3>
          {result && !running && (
            <div style={{ fontSize: 15, marginBottom: 12 }}>{friendlyResult(result)}</div>
          )}
          {result && (
            <div className="cards mb-3">
              {resultCards(result).map((c) => (
                <div className="card" key={c.label}><div className="num">{c.value}</div><div className="label">{c.label}</div></div>
              ))}
            </div>
          )}
          <details {...(result ? {} : { open: true })}>
            <summary className="muted text-sm" style={{ cursor: 'pointer' }}>
              {result ? 'Show activity log' : 'Live activity'}
            </summary>
            <div className="codeblock mt-2" style={{ maxHeight: 240 }}>
              {log.map((l, i) => <div key={i}>{l}</div>)}
              <div ref={logEnd} />
            </div>
          </details>
        </div>
      )}

      <h3 className="mb-1">Recent activity</h3>
      <p className="muted mt-0 mb-3">Select any run for a step-by-step breakdown.</p>
      <div className="data-grid">
        <table>
          <thead><tr><th>Workflow</th><th>Status</th><th>When</th><th>Result</th></tr></thead>
          <tbody>
            {history.map((r) => (
              <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openRun(r.id)}>
                <td><a className="cell-primary" onClick={(e) => { e.preventDefault(); openRun(r.id); }} style={{ textTransform: 'capitalize' }}>{r.kind.replace(/-/g, ' ').replace('hubspot', 'HubSpot')}</a></td>
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
