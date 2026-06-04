import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type SequenceTemplate } from '../api.js';

/** Sequence Library — reusable message sequences, built independently and attached to campaigns. */
export function Sequences() {
  const [seqs, setSeqs] = useState<SequenceTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.sequences().then((d) => setSeqs(d.sequences)).finally(() => setLoading(false)); }, []);

  return (
    <>
      <h1 className="page-title">Sequences</h1>
      <p className="page-sub">
        Reusable message sequences you can build once and attach to any campaign. Create variations to
        A/B test messaging across segments — a campaign gets its own copy, so editing it never changes the template.
      </p>

      <div className="toolbar">
        <Link to="/sequences/new" className="btn btn-primary">+ New sequence</Link>
      </div>

      {loading ? <div className="loading">Loading…</div> : seqs.length === 0 ? (
        <div className="panel"><p>No sequences yet. <Link to="/sequences/new">Build your first sequence</Link> — then attach it when you create a campaign.</p></div>
      ) : (
        <div className="cards">
          {seqs.map((s) => (
            <Link key={s.id} to={`/sequences/${s.id}`} className="panel" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{s.name}</div>
              <div className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>
                {s.stepsJson.length} step{s.stepsJson.length !== 1 ? 's' : ''}{s.persona ? ` · ${s.persona}` : ''}
              </div>
              {s.description && <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{s.description}</div>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
