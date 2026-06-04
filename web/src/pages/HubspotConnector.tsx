import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type HubspotSync } from '../api.js';

function CoverageBar({ label, total, synced, coverage }: { label: string; total: number; synced: number; coverage: number }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong>{label}</strong>
        <span className="muted">{synced.toLocaleString()} of {total.toLocaleString()} linked to HubSpot · {coverage}%</span>
      </div>
      <div className="bar-track" style={{ height: 12 }}>
        <div className="bar-fill" style={{ width: `${coverage}%`, background: coverage >= 80 ? 'var(--green)' : 'var(--accent)' }} />
      </div>
    </div>
  );
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : 'Never');

export function HubspotConnector() {
  const [data, setData] = useState<HubspotSync | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.hubspotSync().then(setData).catch((e) => setErr(String(e))); }, []);

  if (err) return <div className="loading">Error: {err}</div>;
  if (!data) return <div className="loading">Loading…</div>;

  return (
    <>
      <p style={{ margin: '0 0 8px' }}><Link to="/connectors" className="muted">← Connectors</Link></p>
      <h1 className="page-title">HubSpot</h1>
      <p className="page-sub">Your system of record. The engine syncs companies and contacts in both directions.</p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Connection</h3>
        {(() => {
          const ok = data.tokenValid;
          const label = ok ? '● Connected & verified' : data.connected ? '⚠ Token set but failing' : '○ Not configured';
          const color = ok ? 'var(--green-deep)' : 'var(--coral)';
          const bg = ok ? 'rgba(101,194,56,0.14)' : 'rgba(196,117,91,0.12)';
          return (
            <>
              <span style={{ fontSize: 13, fontWeight: 500, padding: '4px 12px', borderRadius: 999, background: bg, color }}>{label}</span>
              {data.tokenValid === false && (
                <div className="muted" style={{ marginTop: 10 }}>
                  {data.tokenDetail}. Check the private-app token + CRM scopes in HubSpot, then update
                  <code> HUBSPOT_TOKEN</code> in Railway.
                </div>
              )}
            </>
          );
        })()}
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Sync coverage</h3>
        <p className="muted" style={{ marginTop: -8 }}>How much of your data is linked to a HubSpot record. Low coverage means records exist here that aren’t in HubSpot yet (push them) — or you haven’t pulled everything from HubSpot.</p>
        <CoverageBar label="Companies" {...data.companies} />
        <CoverageBar label="Contacts" {...data.contacts} />
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Last synced</h3>
        <table>
          <tbody>
            <tr><td>Companies pulled from HubSpot</td><td className="muted">{when(data.lastSync.pullCompanies)}</td></tr>
            <tr><td>Contacts pulled from HubSpot</td><td className="muted">{when(data.lastSync.pullContacts)}</td></tr>
            <tr><td>Pushed to HubSpot</td><td className="muted">{when(data.lastSync.push)}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h3>Actions</h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/runs" className="btn">Sync from HubSpot (Workflows)</Link>
          <Link to="/sync" className="btn btn-primary">Push to HubSpot</Link>
        </div>
      </div>
    </>
  );
}
