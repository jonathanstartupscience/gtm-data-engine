import { useParams, Link } from 'react-router-dom';
import { kbArticleBySlug, kbArticlesByCategory, CATEGORY_LABELS } from '../help/knowledgeBase.js';

/** A single knowledge-base article (/help/:slug) — its own page, with a sidebar of related articles. */
export function HelpArticle() {
  const { slug } = useParams();
  const article = slug ? kbArticleBySlug(slug) : undefined;

  if (!article) {
    return (
      <div className="panel">
        <p>Article not found. <Link to="/help">Back to the knowledge base</Link></p>
      </div>
    );
  }

  const related = kbArticlesByCategory().find((g) => g.category === article.category)?.articles.filter((a) => a.slug !== article.slug) ?? [];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 240px', gap: 28, alignItems: 'start' }}>
      <div>
        <p style={{ margin: '0 0 8px' }}>
          <Link to="/help" className="muted" style={{ textDecoration: 'none' }}>← Knowledge base</Link>
          <span className="muted"> · {CATEGORY_LABELS[article.category]}</span>
        </p>
        <h1 className="page-title">{article.title}</h1>
        <p className="page-sub">{article.intro}</p>

        {article.steps && (
          <div className="panel" style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>How to use it</h3>
            {article.steps.map((s, i) => (
              <div className="help-step" key={i}><span className="n">{i + 1}</span><span>{s}</span></div>
            ))}
          </div>
        )}

        {article.sections.map((s) => (
          <div className="panel" style={{ marginBottom: 12 }} key={s.heading}>
            <h3 style={{ marginTop: 0 }}>{s.heading}</h3>
            <p style={{ marginBottom: 0 }}>{s.body}</p>
          </div>
        ))}

        {article.appRoute && (
          <Link to={article.appRoute} className="btn btn-primary" style={{ marginTop: 8 }}>Go to {article.title} →</Link>
        )}
      </div>

      <aside className="panel" style={{ position: 'sticky', top: 16 }}>
        <div className="eyebrow">More in {CATEGORY_LABELS[article.category]}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {related.map((a) => (
            <Link key={a.slug} to={`/help/${a.slug}`} style={{ fontSize: 14, textDecoration: 'none', color: 'var(--text)' }}>{a.title}</Link>
          ))}
          {related.length === 0 && <span className="muted" style={{ fontSize: 13 }}>No related articles.</span>}
        </div>
      </aside>
    </div>
  );
}
