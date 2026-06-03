import { useEffect, useState } from 'react';
import { api, type Stats } from '../api.js';
import { emailStatusLabel } from '../components/Table.js';

function Bars({ data, labelFn }: { data: { key: string; n: number }[]; labelFn?: (k: string) => string }) {
  const max = Math.max(...data.map((d) => d.n), 1);
  return (
    <div>
      {data.map((d) => (
        <div className="bar-row" key={d.key}>
          <div className="bar-label">{labelFn ? labelFn(d.key) : d.key}</div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${(d.n / max) * 100}%` }} /></div>
          <div className="bar-num">{d.n}</div>
        </div>
      ))}
    </div>
  );
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.stats().then(setStats).catch((e) => setErr(String(e))); }, []);

  if (err) return <div className="loading">Error: {err}</div>;
  if (!stats) return <div className="loading">Loading…</div>;

  const deliverable = stats.byEmailStatus.find((s) => s.key === 'deliverable')?.n ?? 0;

  return (
    <>
      <h1 className="page-title">Your <em>clean</em> GTM data</h1>
      <p className="page-sub">The canonical store — one source of truth for every company and contact.</p>

      <div className="cards">
        <div className="card"><div className="num">{stats.byType.length}</div><div className="label">Company types</div></div>
        <div className="card"><div className="num">{stats.companies.toLocaleString()}</div><div className="label">Companies</div></div>
        <div className="card"><div className="num">{stats.contacts.toLocaleString()}</div><div className="label">Contacts</div></div>
        <div className="card"><div className="num">{deliverable.toLocaleString()}</div><div className="label">Deliverable emails</div></div>
      </div>

      <div className="grid2">
        <div className="panel"><h3>Companies by type</h3><Bars data={stats.byType} /></div>
        <div className="panel"><h3>Companies by sub-type</h3><Bars data={stats.bySubType} /></div>
      </div>
      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="panel"><h3>Contacts by persona</h3><Bars data={stats.byPersona} /></div>
        <div className="panel"><h3>Email deliverability</h3><Bars data={stats.byEmailStatus} labelFn={emailStatusLabel} /></div>
      </div>
    </>
  );
}
