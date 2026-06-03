import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Company, type Contact } from '../api.js';
import { emailStatusLabel } from '../components/Table.js';

export function CompanyDetail() {
  const { id } = useParams();
  const [data, setData] = useState<{ company: Company; contacts: Contact[] } | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { if (id) api.company(id).then(setData).catch((e) => setErr(String(e))); }, [id]);

  if (err) return <div className="loading">Error: {err}</div>;
  if (!data) return <div className="loading">Loading…</div>;
  const { company: c, contacts } = data;

  return (
    <>
      <p style={{ margin: '0 0 8px' }}><Link to="/companies" className="muted">← Companies</Link></p>
      <h1 className="page-title">{c.name}</h1>
      <p className="page-sub">
        {c.domain} · {c.subType} · {[c.city, c.state, c.country].filter(Boolean).join(', ')}
      </p>

      <div className="cards">
        <div className="card"><div className="num">{contacts.length}</div><div className="label">Contacts</div></div>
        <div className="card"><div className="num">{c.foundedYear ?? '—'}</div><div className="label">Founded</div></div>
        <div className="card"><div className="num">{c.sizeEmployees ?? '—'}</div><div className="label">Employees</div></div>
        <div className="card"><div className="num">{c.hubspotId ? '✓' : '—'}</div><div className="label">In HubSpot</div></div>
      </div>

      <div className="panel">
        <h3>Contacts at this company</h3>
        <table>
          <thead><tr><th>Name</th><th>Title</th><th>Email</th><th>Persona</th><th>Status</th></tr></thead>
          <tbody>
            {contacts.map((p) => (
              <tr key={p.id}>
                <td>{[p.firstName, p.lastName].filter(Boolean).join(' ')}</td>
                <td className="muted">{p.jobTitle}</td>
                <td className="muted">{p.email}</td>
                <td>{p.persona && <span className="tag persona">{p.persona}</span>}</td>
                <td>{p.emailStatus && <span className={`tag ${p.emailStatus}`}>{emailStatusLabel(p.emailStatus)}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
