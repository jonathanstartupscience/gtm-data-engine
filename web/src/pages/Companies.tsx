import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadCsv, type Company } from '../api.js';

const LIMIT = 50;

export function Companies() {
  const [q, setQ] = useState('');
  const [subType, setSubType] = useState('');
  const [country, setCountry] = useState('');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [facets, setFacets] = useState<{ subTypes: { v: string; n: number }[]; countries: { v: string; n: number }[] }>({ subTypes: [], countries: [] });

  useEffect(() => { api.companyFacets().then(setFacets); }, []);
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api.companies(q, subType, country, LIMIT, offset).then((d) => { setRows(d.rows); setTotal(d.total); setLoading(false); });
    }, 200);
    return () => clearTimeout(t);
  }, [q, subType, country, offset]);

  const clear = () => { setQ(''); setSubType(''); setCountry(''); setOffset(0); };
  const active = q || subType || country;

  const exportCsv = () => {
    const params = new URLSearchParams({ q, subType, country });
    downloadCsv(`/api/export/companies?${params}`, 'companies.csv').catch((e) => alert('Export failed: ' + e));
  };

  return (
    <>
      <div className="eyebrow">Browse</div>
      <h1 className="page-title">Companies</h1>
      <p className="page-sub">{total.toLocaleString()} matching{active ? ' (filtered)' : ' in the store'}</p>

      <div className="toolbar">
        <input className="input" placeholder="Search name or domain…"
          value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} />
        <select className="select" value={subType} onChange={(e) => { setSubType(e.target.value); setOffset(0); }}>
          <option value="">All sub-types</option>
          {facets.subTypes.map((s) => <option key={s.v} value={s.v}>{s.v} ({s.n})</option>)}
        </select>
        <select className="select" value={country} onChange={(e) => { setCountry(e.target.value); setOffset(0); }}>
          <option value="">All countries</option>
          {facets.countries.map((c) => <option key={c.v} value={c.v}>{c.v} ({c.n})</option>)}
        </select>
        {active && <button className="btn" onClick={clear}>Clear filters</button>}
        <button className="btn btn-primary" disabled={total === 0} onClick={exportCsv}>
          Export {total.toLocaleString()} → CSV
        </button>
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <table>
          <thead><tr><th>Company</th><th>Domain</th><th>Sub-type</th><th>Location</th><th>HubSpot</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/companies/${c.id}`}>{c.name ?? '—'}</Link></td>
                <td className="muted">{c.domain}</td>
                <td>{c.subType && <span className="tag persona">{c.subType}</span>}</td>
                <td className="muted">{[c.city, c.state, c.country].filter(Boolean).join(', ')}</td>
                <td className="muted">{c.hubspotId ? '✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="pager">
        <button className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>← Prev</button>
        <span>{total ? offset + 1 : 0}–{Math.min(offset + LIMIT, total)} of {total}</span>
        <button className="btn" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>Next →</button>
      </div>
    </>
  );
}
