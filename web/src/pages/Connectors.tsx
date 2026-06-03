import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Connector } from '../api.js';

const PAGE: Record<string, string> = { hubspot: '/connectors/hubspot', emailbison: '/campaigns' };

export function Connectors() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  useEffect(() => { api.connectors().then((d) => setConnectors(d.connectors)); }, []);

  return (
    <>
      <h1 className="page-title">Connectors</h1>
      <p className="page-sub">The external systems wired into the engine — what each does and whether it’s connected.</p>

      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        {connectors.map((c) => {
          const href = PAGE[c.id];
          const inner = (
            <div className="card" style={{ height: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{c.name}</div>
                <span style={{
                  fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 999,
                  background: c.connected ? 'rgba(101,194,56,0.14)' : 'rgba(196,117,91,0.12)',
                  color: c.connected ? 'var(--green-deep)' : 'var(--coral)',
                }}>{c.connected ? '● Connected' : '○ Not configured'}</span>
              </div>
              <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>{c.role}</div>
              {href && <div style={{ marginTop: 12, color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>Open →</div>}
            </div>
          );
          return href
            ? <Link key={c.id} to={href} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link>
            : <div key={c.id}>{inner}</div>;
        })}
      </div>
    </>
  );
}
