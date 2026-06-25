import { useEffect, useState } from 'react';
import { api, type LogEvent } from '../api.js';

const INTEGRATION_LABELS: Record<string, string> = {
  hubspot: 'HubSpot', airscale: 'Airscale', bouncer: 'Bouncer',
  ocean: 'Ocean.io', emailBison: 'Email Bison', heyreach: 'Heyreach',
};

export function Logs() {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const [integrations, setIntegrations] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const load = () => api.logs().then((d) => { setEvents(d.events); setIntegrations(d.integrations); setLoading(false); });
  useEffect(() => { load(); }, []);

  const color = (l: string) => (l === 'error' ? 'var(--coral)' : l === 'warn' ? '#8b5e00' : 'var(--text-muted)');
  const errors = events.filter((e) => e.level === 'error').length;

  return (
    <>
      <h1 className="page-title">Logs &amp; <em>health</em></h1>
      <p className="page-sub">Recent activity and system status — check here first when something breaks.</p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Integrations</h3>
        <p className="muted" style={{ marginTop: -8 }}>External tools with a key configured on the server. If one is off, its features won’t run.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {Object.entries(INTEGRATION_LABELS).map(([k, label]) => (
            <span key={k} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              borderRadius: 999, border: '1px solid var(--border)',
              background: integrations[k] ? 'rgba(101,194,56,0.12)' : 'rgba(196,117,91,0.1)',
              color: integrations[k] ? 'var(--green-deep)' : 'var(--coral)', fontWeight: 500, fontSize: 13,
            }}>
              {integrations[k] ? '●' : '○'} {label} {integrations[k] ? 'connected' : 'not configured'}
            </span>
          ))}
        </div>
      </div>

      <div className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Recent activity{errors > 0 ? ` · ${errors} error${errors > 1 ? 's' : ''}` : ''}</h3>
          <button className="btn" onClick={load}>Refresh</button>
        </div>
        {loading ? <div className="loading">Loading…</div> : (
          <table style={{ marginTop: 12 }}>
            <thead><tr><th>When</th><th>Activity</th><th>Status</th><th>Detail</th></tr></thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>{new Date(e.at).toLocaleString()}</td>
                  <td style={{ textTransform: 'capitalize' }}>{e.kind.replace(/-/g, ' ')}</td>
                  <td><span style={{ color: color(e.level), fontWeight: 600 }}>{e.level === 'info' ? e.status : e.level}</span></td>
                  <td className="muted">{e.message}</td>
                </tr>
              ))}
              {events.length === 0 && <tr><td colSpan={4} className="muted">No activity yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
