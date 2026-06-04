import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GENERAL, kbArticlesByCategory, type KbCategory } from '../help/knowledgeBase.js';

const CAT_DOT: Record<KbCategory, string> = {
  'getting-started': 'var(--amber)', concepts: 'var(--text-muted)',
  data: 'var(--green)', email: 'var(--accent)', linkedin: '#0a66c2',
};

/** Knowledge base INDEX — categorized cards; each links to its own article page (/help/:slug). */
export function Help() {
  const [q, setQ] = useState('');
  const groups = kbArticlesByCategory();
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? groups.map((g) => ({ ...g, articles: g.articles.filter((a) => (a.title + ' ' + a.summary + ' ' + a.intro).toLowerCase().includes(needle)) })).filter((g) => g.articles.length)
    : groups;

  return (
    <>
      <h1 className="page-title">Knowledge <em>base</em></h1>
      <p className="page-sub">{GENERAL.intro}</p>

      <input className="input" style={{ width: '100%', maxWidth: 460, marginBottom: 24 }}
        placeholder="Search the knowledge base…" value={q} onChange={(e) => setQ(e.target.value)} />

      {filtered.length === 0 && <div className="panel"><p className="muted">No articles match “{q}”.</p></div>}

      {filtered.map((g) => (
        <div key={g.category} style={{ marginBottom: 28 }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontWeight: 400, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: CAT_DOT[g.category] }} /> {g.label}
          </h2>
          <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {g.articles.map((a) => (
              <Link key={a.slug} to={`/help/${a.slug}`} className="panel" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{a.title}</div>
                <div className="muted" style={{ fontSize: 14, marginTop: 6, lineHeight: 1.5 }}>{a.summary}</div>
                <div style={{ marginTop: 10, color: 'var(--accent)', fontSize: 13, fontWeight: 500 }}>Read →</div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
