import { useEffect, useState } from 'react';
import { api, authToken, type HygieneAnalytics } from '../api.js';
import { refreshTaxonomy } from '../hooks/useTaxonomy.js';
import { CostBadge } from '../components/CostBadge.js';
import { PageHeader } from '../components/PageHeader.js';

interface Task { id: string; name: string; desc: string; key: string; }
const TASKS: Task[] = [
  { id: 'pairing', key: 'pairing', name: 'Pair Type from Sub-type',
    desc: 'For companies with a Sub-type (ICP) but no Type, sets the Type from the canonical taxonomy (University → ESO, PE → Investor, Software → Provider…) and writes it back to HubSpot. Companies missing both go to AI Classify.' },
  { id: 'association-repair', key: 'associationRepair', name: 'Repair contact → company links',
    desc: 'Links orphaned contacts to a company you already have by matching email domain. Makes them usable by company and type.' },
  { id: 'persona-backfill', key: 'personaBackfill', name: 'Backfill personas',
    desc: 'Tags contacts that have a job title but no persona, via the built-in title classifier.' },
  { id: 'normalize', key: 'normalize', name: 'Normalize country values',
    desc: 'Canonicalizes inconsistent country values (US / USA / United States → United States) so filters and segments stay reliable.' },
];

function HealthBar({ label, have, total }: { label: string; have: number; total: number }) {
  const pct = total ? Math.round((have / total) * 100) : 0;
  return (
    <div className="bar-row">
      <div className="bar-label">{label}</div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--green)' : pct >= 40 ? 'var(--accent)' : 'var(--coral)' }} /></div>
      <div className="bar-num">{pct}%</div>
    </div>
  );
}

export function Hygiene() {
  const [a, setA] = useState<HygieneAnalytics | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<Record<string, number> | null>(null);

  const load = () => { api.hygieneAnalytics().then(setA); };
  useEffect(() => { load(); }, []);

  async function run(task: string) {
    setRunning(task); setLog([]); setResult(null);
    const token = await authToken();
    const es = new EventSource(`/api/hygiene/run/${task}${token ? `?token=${encodeURIComponent(token)}` : ''}`);
    es.addEventListener('log', (e) => setLog((l) => [...l, JSON.parse(e.data).message]));
    es.addEventListener('done', (e) => { setResult(JSON.parse(e.data).stats); es.close(); setRunning(null); load(); refreshTaxonomy(); });
    es.addEventListener('error', (e) => {
      const d = (e as MessageEvent).data;
      setLog((l) => [...l, d ? `✗ ${JSON.parse(d).message}` : '… disconnected — still running; check Logs & Health']);
      es.close(); setRunning(null); load();
    });
  }

  return (
    <>
      <PageHeader
        title={<>Data <em>hygiene</em></>}
        sub={<>Every task is <strong>free</strong> — runs on data you already have, no vendor cost.</>}
      />

      {a && (
        <div className="grid2 mb-4">
          <div className="panel">
            <h3>Company data health · {a.companies.total.toLocaleString()}</h3>
            <HealthBar label="Has type" have={a.companies.typed} total={a.companies.total} />
            <HealthBar label="Has domain" have={a.companies.withDomain} total={a.companies.total} />
            <HealthBar label="Has size" have={a.companies.withSize} total={a.companies.total} />
          </div>
          <div className="panel">
            <h3>Contact data health · {a.contacts.total.toLocaleString()}</h3>
            <HealthBar label="Has persona" have={a.contacts.withPersona} total={a.contacts.total} />
            <HealthBar label="Linked to company" have={a.contacts.total - a.contacts.orphans} total={a.contacts.total} />
            <HealthBar label="Email verified" have={a.contacts.verified} total={a.contacts.total} />
          </div>
        </div>
      )}

      <div className="cards" style={{ gridTemplateColumns: '1fr' }}>
        {TASKS.map((t) => {
          const cand = a?.tasks?.[t.key]?.candidates ?? null;
          return (
            <div className="card" key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{t.name}</div>
                <div className="muted mt-1" style={{ maxWidth: 620 }}>{t.desc}</div>
                <div className="mt-2" style={{ fontWeight: 600 }}>
                  {cand === null ? 'Analyzing…' : cand === 0 ? 'Nothing to fix — all clean ✓' : `${cand.toLocaleString()} records will be updated`}
                </div>
              </div>
              {/* Uniform cost slot (top-right) + action, so Free vs paid is always in the same place. */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
                <CostBadge costUsd={0} />
                <button className="btn btn-primary" disabled={!!running || cand === 0}
                  onClick={() => run(t.id)}>{running === t.id ? 'Running…' : 'Run'}</button>
              </div>
            </div>
          );
        })}
      </div>

      {(log.length > 0 || result) && (
        <div className="panel mt-4">
          <h3>Result</h3>
          {result && (
            <p style={{ fontSize: 15 }}>
              {Object.entries(result).map(([k, v]) => `${Number(v).toLocaleString()} ${k}`).join(' · ')}.
            </p>
          )}
          <details {...(result ? {} : { open: true })}><summary className="muted">Activity</summary>
            <div className="codeblock mt-2" style={{ maxHeight: 200 }}>
              {log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </details>
        </div>
      )}
    </>
  );
}
