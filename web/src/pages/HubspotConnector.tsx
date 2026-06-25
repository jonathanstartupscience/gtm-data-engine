import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type HubspotSync } from '../api.js';
import { PageHeader } from '../components/PageHeader.js';

function CoverageBar({ label, total, synced, coverage }: { label: string; total: number; synced: number; coverage: number }) {
  return (
    <div className="mb-4">
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

  if (err) return <div className="error-state">Couldn’t load the HubSpot connector — refresh, and check the HubSpot token in Railway if it persists.</div>;
  if (!data) return <div className="loading">Loading…</div>;

  return (
    <>
      <p className="mt-0 mb-2"><Link to="/settings" className="muted">← Settings · Connectors</Link></p>
      <PageHeader title="HubSpot" sub="System of record. Companies and contacts sync both ways." />

      <div className="panel mb-4">
        <h3>Connection</h3>
        {(() => {
          const ok = data.tokenValid;
          const label = ok ? 'Connected & verified' : data.connected ? 'Token set but failing' : 'Not configured';
          const sym = ok ? '●' : data.connected ? '⚠' : '○';
          return (
            <>
              <span className={'tag ' + (ok ? 'deliverable' : 'undeliverable')}><span aria-hidden="true">{sym}</span> {label}</span>
              {data.tokenValid === false && (
                <div className="muted" style={{ marginTop: 10 }}>
                  {data.tokenDetail}. Check the private-app token in HubSpot, then update
                  <code> HUBSPOT_TOKEN</code> in Railway.
                </div>
              )}
              {data.tokenFingerprint && (
                <div className="muted text-xs" style={{ marginTop: 10 }}>
                  Token in Railway: <code>{data.tokenFingerprint.prefix}…{data.tokenFingerprint.last4}</code>
                  {' '}· length {data.tokenFingerprint.len}
                  {data.tokenFingerprint.hasWhitespace && <strong className="text-error"> · ⚠ contains a space/newline — re-paste it cleanly</strong>}
                </div>
              )}
            </>
          );
        })()}
      </div>

      <div className="panel mb-4">
        <h3>What’s in the engine vs HubSpot</h3>
        <p className="muted" style={{ marginTop: -8 }}>“Linked” = the record exists in both. One here but not in HubSpot can be pushed; one in HubSpot but not here can be pulled.</p>
        <CoverageBar label="Companies" {...data.companies} />
        <CoverageBar label="Contacts" {...data.contacts} />
        {(() => {
          const coNotInHs = Math.max(data.companies.total - data.companies.synced, 0);
          const ctNotInHs = Math.max(data.contacts.total - data.contacts.synced, 0);
          if (coNotInHs + ctNotInHs === 0) return <p style={{ color: 'var(--green-deep)' }}>Everything here is linked to HubSpot ✓</p>;
          return (
            <div className="callout callout-warn mt-2">
              <p style={{ margin: '0 0 8px' }}>
                <strong>{coNotInHs.toLocaleString()}</strong> companies and <strong>{ctNotInHs.toLocaleString()}</strong> contacts here are
                <strong> not yet in HubSpot</strong>. Push to add them — you preview every change first.
              </p>
              <Link to="/sync" className="btn btn-primary">Review &amp; push to HubSpot →</Link>
            </div>
          );
        })()}
      </div>

      <div className="panel mb-4">
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
