/** Context-aware help drawer. Renders the knowledge-base entry for the current page (see
 *  web/src/help/knowledgeBase.ts — the single source of truth) + a link to the full KB. */
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { GENERAL, helpForPath, slugForRoute } from '../help/knowledgeBase.js';

export function HelpDrawer({ page, onClose }: { page: string; onClose: () => void }) {
  const help = helpForPath(page);
  const articleSlug = slugForRoute(page);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Modal a11y: close on Escape, focus the close button on open, and restore focus to whatever was
  // focused before (the "Help for this page" trigger) when the drawer closes.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);

  return (
    <>
      <div className="help-overlay" onClick={onClose} />
      <div className="help-drawer" role="dialog" aria-modal="true" aria-label={`Help: ${help.title}`}>
        <button className="help-close" ref={closeRef} onClick={onClose} aria-label="Close help">×</button>
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
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {help.route !== '_general' && <Link to={`/help/${articleSlug}`} className="btn btn-primary" onClick={onClose}>Read the full article →</Link>}
            <Link to="/help" className="btn" onClick={onClose}>Browse knowledge base</Link>
          </div>
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
