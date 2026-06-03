import { useEffect, useState } from 'react';
import { api, type Stats } from '../api.js';

function Bars({ data }: { data: { key: string; n: number }[] }) {
  const max = Math.max(...data.map((d) => d.n), 1);
  return (
    <div>
      {data.map((d) => (
        <div className="bar-row" key={d.key}>
          <div className="bar-label">{d.key}</div>
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

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-sub">Canonical store — the single source of truth for GTM data.</p>

      <div className="cards">
        <div className="card"><div className="num">{stats.companies.toLocaleString()}</div><div className="label">Companies</div></div>
        <div className="card"><div className="num">{stats.contacts.toLocaleString()}</div><div className="label">Contacts</div></div>
        <div className="card">
          <div className="num">{(stats.byEmailStatus.find((s) => s.key === 'deliverable')?.n ?? 0).toLocaleString()}</div>
          <div className="label">Deliverable emails</div>
        </div>
        <div className="card">
          <div className="num">{stats.byPersona.length}</div><div className="label">Personas tagged</div>
        </div>
      </div>

      <div className="grid2">
        <div className="panel"><h3>Companies by sub-type</h3><Bars data={stats.bySubType} /></div>
        <div className="panel"><h3>Contacts by persona</h3><Bars data={stats.byPersona} /></div>
      </div>
      <div className="panel" style={{ marginTop: 16 }}><h3>Email deliverability</h3><Bars data={stats.byEmailStatus} /></div>
    </>
  );
}
