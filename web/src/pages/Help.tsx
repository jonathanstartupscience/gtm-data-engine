import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GENERAL, CONCEPTS, kbByWorkspace, type KbPage } from '../help/knowledgeBase.js';

const WS_DOT: Record<string, string> = { data: 'var(--green)', email: 'var(--accent)', linkedin: '#0a66c2' };

function PageCard({ p }: { p: KbPage }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
        <div>
          <strong style={{ fontSize: 16 }}>{p.title}</strong>
          {!open && <div className="muted" style={{ fontSize: 14, marginTop: 4 }}>{p.intro}</div>}
        </div>
        <span className="muted" style={{ fontSize: 13 }}>{open ? '▴' : 'open ▾'}</span>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <p>{p.intro}</p>
          {p.steps && (
            <>
              <h4>How to use it</h4>
              {p.steps.map((s, i) => <div className="help-step" key={i}><span className="n">{i + 1}</span><span>{s}</span></div>)}
            </>
          )}
          {p.sections.map((s) => (
            <div key={s.heading}><h4>{s.heading}</h4><p style={{ marginTop: 2 }}>{s.body}</p></div>
          ))}
          {p.route !== '_general' && <Link to={p.route} className="btn" style={{ marginTop: 8 }}>Go to {p.title} →</Link>}
        </div>
      )}
    </div>
  );
}

/** Full knowledge base — how the whole platform works, grouped by workspace, plus core concepts. */
export function Help() {
  const groups = kbByWorkspace();
  return (
    <>
      <h1 className="page-title">Knowledge <em>base</em></h1>
      <p className="page-sub">How the whole platform works — every page explained, plus the core concepts. Click any card to expand. (Each page also has contextual help via the “?” button.)</p>

      <div className="panel" style={{ marginBottom: 24 }}>
        <h3 style={{ marginTop: 0 }}>{GENERAL.title}</h3>
        <p>{GENERAL.intro}</p>
        {GENERAL.sections.map((s) => (
          <div key={s.heading}><h4>{s.heading}</h4><p style={{ marginTop: 2 }}>{s.body}</p></div>
        ))}
      </div>

      <h2 style={{ fontFamily: "'DM Serif Display', serif", fontWeight: 400, marginBottom: 12 }}>Core concepts</h2>
      <div className="panel" style={{ marginBottom: 24 }}>
        {CONCEPTS.map((c) => (
          <div key={c.heading}><h4>{c.heading}</h4><p style={{ marginTop: 2 }}>{c.body}</p></div>
        ))}
      </div>

      {groups.map((g) => (
        <div key={g.workspace} style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontWeight: 400, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: WS_DOT[g.workspace] }} /> {g.label}
          </h2>
          {g.pages.map((p) => <PageCard key={p.route} p={p} />)}
        </div>
      ))}
    </>
  );
}
