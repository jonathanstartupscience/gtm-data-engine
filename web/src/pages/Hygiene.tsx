import { useEffect, useState } from 'react';
import { api, authToken, type HygieneAnalytics } from '../api.js';

interface Task { id: string; name: string; desc: string; key: string; }
const TASKS: Task[] = [
  { id: 'association-repair', key: 'associationRepair', name: 'Repair contact → company links',
    desc: 'Links orphaned contacts to a company by matching their email domain to a company you already have. Makes contacts usable by company and type.' },
  { id: 'persona-backfill', key: 'personaBackfill', name: 'Backfill personas',
    desc: 'Tags contacts that have a job title but no persona, using the built-in title classifier. Instantly improves segmentation.' },
  { id: 'normalize', key: 'normalize', name: 'Normalize country values',
    desc: 'Canonicalizes inconsistent country values (US / USA / United States → United States) so filters and segments are reliable.' },
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
    es.addEventListener('done', (e) => { setResult(JSON.parse(e.data).stats); es.close(); setRunning(null); load(); });
    es.addEventListener('error', (e) => {
      const d = (e as MessageEvent).data;
      setLog((l) => [...l, d ? `✗ ${JSON.parse(d).message}` : '… disconnected — still running; check Logs & Health']);
      es.close(); setRunning(null); load();
    });
  }

  return (
    <>
      <h1 className="page-title">Data <em>hygiene</em></h1>
      <p className="page-sub">Clean and complete your CRM data. The tasks below are <strong>free</strong> — they work on data you already have, with no vendor cost. Each shows how many records it will affect before you run it.</p>

      {a && (
        <div className="grid2" style={{ marginBottom: 16 }}>
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
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {t.name}
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'rgba(101,194,56,0.16)', color: 'var(--green-deep)' }}>FREE</span>
                </div>
                <div className="muted" style={{ marginTop: 4, maxWidth: 620 }}>{t.desc}</div>
                <div style={{ marginTop: 8, fontWeight: 600 }}>
                  {cand === null ? 'Analyzing…' : cand === 0 ? 'Nothing to fix — all clean ✓' : `${cand.toLocaleString()} records will be updated`}
                </div>
              </div>
              <button className="btn btn-primary" disabled={!!running || cand === 0}
                onClick={() => run(t.id)}>{running === t.id ? 'Running…' : 'Run'}</button>
            </div>
          );
        })}
      </div>

      {(log.length > 0 || result) && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3>Result</h3>
          {result && (
            <p style={{ fontSize: 15 }}>
              {Object.entries(result).map(([k, v]) => `${Number(v).toLocaleString()} ${k}`).join(' · ')}.
            </p>
          )}
          <details {...(result ? {} : { open: true })}><summary className="muted">Activity</summary>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.7, maxHeight: 200, overflow: 'auto', marginTop: 8 }}>
              {log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </details>
        </div>
      )}
    </>
  );
}
