import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Stats } from '../api.js';
import { emailStatusLabel } from '../components/Table.js';

const EMPTY_KEY = '(Empty — not set)';

function Bars({ data, labelFn }: { data: { key: string; n: number }[]; labelFn?: (k: string) => string }) {
  const max = Math.max(...data.map((d) => d.n), 1);
  return (
    <div>
      {data.map((d) => {
        const isEmpty = d.key === EMPTY_KEY;
        return (
          <div className="bar-row" key={d.key}>
            <div className="bar-label" style={isEmpty ? { color: 'var(--coral)', fontWeight: 600 } : undefined}>
              {isEmpty ? d.key : (labelFn ? labelFn(d.key) : d.key)}
            </div>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${(d.n / max) * 100}%`, background: isEmpty ? 'var(--coral)' : undefined }} /></div>
            <div className="bar-num">{d.n.toLocaleString()}</div>
          </div>
        );
      })}
    </div>
  );
}

/** A completeness stat with a % filled + link to the relevant cleanup. */
function Completeness({ label, filled, total, to }: { label: string; filled: number; total: number; to: string }) {
  const pct = total ? Math.round((filled / total) * 100) : 0;
  const missing = total - filled;
  return (
    <Link to={to} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="num" style={{ color: pct >= 80 ? 'var(--green-deep)' : pct >= 40 ? '#8b5e00' : 'var(--coral)' }}>{pct}%</div>
      <div className="label">{label} set</div>
      {missing > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{missing.toLocaleString()} to fill →</div>}
    </Link>
  );
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.stats().then(setStats).catch((e) => setErr(String(e))); }, []);

  if (err) return <div className="loading">Error: {err}</div>;
  if (!stats) return <div className="loading">Loading…</div>;

  const deliverable = stats.byEmailStatus.find((s) => s.key === 'deliverable')?.n ?? 0;
  const g = stats.gaps;

  return (
    <>
      <h1 className="page-title">Data <em>health</em></h1>
      <p className="page-sub">Your canonical store and how complete it is — here and in HubSpot. Red bars are the gaps to close.</p>

      <div className="cards">
        <div className="card"><div className="num">{stats.companies.toLocaleString()}</div><div className="label">Companies</div></div>
        <div className="card"><div className="num">{stats.contacts.toLocaleString()}</div><div className="label">Contacts</div></div>
        <div className="card"><div className="num">{deliverable.toLocaleString()}</div><div className="label">Deliverable emails</div></div>
      </div>

      <h3 style={{ margin: '8px 0 12px' }}>Completeness</h3>
      <div className="cards">
        <Completeness label="Company Type" filled={stats.companies - g.companiesNoType} total={stats.companies} to="/classify" />
        <Completeness label="Company Sub-type" filled={stats.companies - g.companiesNoSubType} total={stats.companies} to="/classify" />
        <Completeness label="Contact Persona" filled={stats.contacts - g.contactsNoPersona} total={stats.contacts} to="/hygiene" />
        <Completeness label="Email verified" filled={stats.byEmailStatus.filter((s) => s.key !== EMPTY_KEY).reduce((a, s) => a + s.n, 0)} total={stats.contacts} to="/hygiene" />
      </div>

      <div className="grid2" style={{ marginTop: 8 }}>
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
