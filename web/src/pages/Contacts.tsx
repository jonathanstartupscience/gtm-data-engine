import { useEffect, useState } from 'react';
import { api, downloadCsv, type Contact } from '../api.js';

const LIMIT = 50;
const PERSONAS = ['', 'ESO Leadership', 'ESO Program', 'ESO Partnerships', 'ESO Founder/GP'];
const STATUSES = ['', 'deliverable', 'risky_catchall', 'role_based', 'undeliverable', 'unknown', 'no_email'];

export function Contacts() {
  const [q, setQ] = useState('');
  const [persona, setPersona] = useState('');
  const [emailStatus, setEmailStatus] = useState('');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api.contacts(q, persona, emailStatus, LIMIT, offset)
        .then((d) => { setRows(d.rows); setTotal(d.total); setLoading(false); });
    }, 200);
    return () => clearTimeout(t);
  }, [q, persona, emailStatus, offset]);

  const active = q || persona || emailStatus;
  const exportCsv = () => {
    const params = new URLSearchParams({ q, persona, emailStatus });
    downloadCsv(`/api/export/contacts?${params}`, 'contacts.csv').catch((e) => alert('Export failed: ' + e));
  };

  return (
    <>
      <div className="eyebrow">Browse</div>
      <h1 className="page-title">Contacts</h1>
      <p className="page-sub">{total.toLocaleString()} matching{active ? ' (filtered)' : ''}</p>

      <div className="toolbar">
        <input className="input" placeholder="Search name, email, title…"
          value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} />
        <select className="select" value={persona} onChange={(e) => { setPersona(e.target.value); setOffset(0); }}>
          {PERSONAS.map((p) => <option key={p} value={p}>{p || 'All personas'}</option>)}
        </select>
        <select className="select" value={emailStatus} onChange={(e) => { setEmailStatus(e.target.value); setOffset(0); }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'All email statuses'}</option>)}
        </select>
        {active && <button className="btn" onClick={() => { setQ(''); setPersona(''); setEmailStatus(''); setOffset(0); }}>Clear filters</button>}
        <button className="btn btn-primary" disabled={total === 0} onClick={exportCsv}>
          Export {total.toLocaleString()} → CSV
        </button>
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <table>
          <thead><tr><th>Name</th><th>Title</th><th>Email</th><th>Persona</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}</td>
                <td className="muted">{c.jobTitle}</td>
                <td className="muted">{c.email}</td>
                <td>{c.persona && <span className="tag persona">{c.persona}</span>}</td>
                <td>{c.emailStatus && <span className={`tag ${c.emailStatus}`}>{c.emailStatus}</span>}</td>
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
