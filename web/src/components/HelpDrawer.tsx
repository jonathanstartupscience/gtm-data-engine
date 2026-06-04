/** Context-aware help drawer. Renders the knowledge-base entry for the current page (see
 *  web/src/help/knowledgeBase.ts — the single source of truth) + a link to the full KB. */
import { Link } from 'react-router-dom';
import { GENERAL, helpForPath } from '../help/knowledgeBase.js';

export function HelpDrawer({ page, onClose }: { page: string; onClose: () => void }) {
  const help = helpForPath(page);
  return (
    <>
      <div className="help-overlay" onClick={onClose} />
      <div className="help-drawer">
        <button className="help-close" onClick={onClose}>×</button>
        <div className="eyebrow">Help</div>
        <h2>{help.title}</h2>
        <p>{help.intro}</p>

        {help.steps && (
          <>
            <h4>How to use this page</h4>
            {help.steps.map((s, i) => (
              <div className="help-step" key={i}><span className="n">{i + 1}</span><span>{s}</span></div>
            ))}
          </>
        )}

        {help.sections.map((s) => (
          <div key={s.heading}>
            <h4>{s.heading}</h4>
            <p>{s.body}</p>
          </div>
        ))}

        <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
          <Link to="/help" className="btn btn-primary" onClick={onClose}>Open the full knowledge base →</Link>
          {help.route !== '_general' && (
            <>
              <h4 style={{ marginTop: 20 }}>New here?</h4>
              <p>{GENERAL.intro}</p>
            </>
          )}
        </div>
      </div>
    </>
  );
}
