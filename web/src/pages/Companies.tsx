import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Company } from '../api.js';

const LIMIT = 50;

export function Companies() {
  const [q, setQ] = useState('');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api.companies(q, LIMIT, offset).then((d) => { setRows(d.rows); setTotal(d.total); setLoading(false); });
    }, 200);
    return () => clearTimeout(t);
  }, [q, offset]);

  return (
    <>
      <h1 className="page-title">Companies</h1>
      <p className="page-sub">{total.toLocaleString()} in the store</p>

      <div className="toolbar">
        <input className="input" placeholder="Search name, domain, sub-type…"
          value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} />
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <table>
          <thead><tr><th>Company</th><th>Domain</th><th>Sub-type</th><th>Location</th><th>HubSpot</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/companies/${c.id}`}>{c.name ?? '—'}</Link></td>
                <td className="muted">{c.domain}</td>
                <td>{c.subType}</td>
                <td className="muted">{[c.city, c.state, c.country].filter(Boolean).join(', ')}</td>
                <td className="muted">{c.hubspotId ? '✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="pager">
        <button className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>← Prev</button>
        <span>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
        <button className="btn" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>Next →</button>
      </div>
    </>
  );
}
