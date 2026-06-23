import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type SequenceTemplate, type EmailStyle, type EmailPersonaInfo } from '../api.js';

/** Sequence Library — reusable message sequences, built independently and attached to campaigns. */
export function Sequences() {
  const [seqs, setSeqs] = useState<SequenceTemplate[]>([]);
  const [styles, setStyles] = useState<EmailStyle[]>([]);
  const [personas, setPersonas] = useState<EmailPersonaInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [fStyle, setFStyle] = useState('');
  const [fPersona, setFPersona] = useState('');
  const [fPain, setFPain] = useState('');
  const [fOffer, setFOffer] = useState('');   // '', 'with', 'without'

  useEffect(() => {
    api.sequences().then((d) => setSeqs(d.sequences)).finally(() => setLoading(false));
    api.emailStyles().then((d) => setStyles(d.styles)).catch(() => {});
    api.emailPersonas().then((d) => setPersonas(d.personas)).catch(() => {});
  }, []);

  const styleName = (k: string | null) => styles.find((s) => s.key === k)?.name ?? k ?? '';
  const personaName = (k: string | null) => personas.find((p) => p.key === k)?.name ?? k ?? '';

  // Only offer filter facets that actually appear in the saved library, so filters never go empty.
  const presentStyles = useMemo(() => [...new Set(seqs.map((s) => s.styleKey).filter(Boolean))] as string[], [seqs]);
  const presentPersonas = useMemo(() => [...new Set(seqs.map((s) => s.personaKey).filter(Boolean))] as string[], [seqs]);
  const presentPains = useMemo(
    () => [...new Map(seqs.filter((s) => s.painLabel).map((s) => [s.painKey, s.painLabel])).entries()] as [string, string][],
    [seqs],
  );

  const filtered = seqs.filter((s) =>
    (!fStyle || s.styleKey === fStyle) &&
    (!fPersona || s.personaKey === fPersona) &&
    (!fPain || s.painKey === fPain) &&
    (!fOffer || (fOffer === 'with' ? !!s.leadMagnetId : !s.leadMagnetId)));

  const anyFilter = fStyle || fPersona || fPain || fOffer;
  const anyMeta = seqs.some((s) => s.styleKey || s.personaKey);

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

      {/* Filter bar — only shown once there's generation metadata to filter on. */}
      {anyMeta && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="toolbar" style={{ marginBottom: 0, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 13 }}>Filter:</span>
            <select className="select" value={fStyle} onChange={(e) => setFStyle(e.target.value)}>
              <option value="">Any style</option>
              {presentStyles.map((k) => <option key={k} value={k}>{styleName(k)}</option>)}
            </select>
            <select className="select" value={fPersona} onChange={(e) => { setFPersona(e.target.value); setFPain(''); }}>
              <option value="">Any persona</option>
              {presentPersonas.map((k) => <option key={k} value={k}>{personaName(k)}</option>)}
            </select>
            {presentPains.length > 0 && (
              <select className="select" value={fPain} onChange={(e) => setFPain(e.target.value)}>
                <option value="">Any pain / angle</option>
                {presentPains.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            )}
            <select className="select" value={fOffer} onChange={(e) => setFOffer(e.target.value)}>
              <option value="">Offer: any</option>
              <option value="with">With a lead magnet</option>
              <option value="without">No lead magnet</option>
            </select>
            {anyFilter && (
              <button className="btn" style={{ padding: '4px 10px' }}
                onClick={() => { setFStyle(''); setFPersona(''); setFPain(''); setFOffer(''); }}>Clear</button>
            )}
            <span className="muted" style={{ fontSize: 13, marginLeft: 'auto' }}>{filtered.length} of {seqs.length}</span>
          </div>
        </div>
      )}

      {loading ? <div className="loading">Loading…</div> : seqs.length === 0 ? (
        <div className="panel"><p>No sequences yet. <Link to="/sequences/new">Build your first sequence</Link> — then attach it when you create a campaign.</p></div>
      ) : filtered.length === 0 ? (
        <div className="panel"><p className="muted">No sequences match these filters. <button className="btn" style={{ padding: '2px 8px' }} onClick={() => { setFStyle(''); setFPersona(''); setFPain(''); setFOffer(''); }}>Clear filters</button></p></div>
      ) : (
        <div className="cards">
          {filtered.map((s) => (
            <Link key={s.id} to={`/sequences/${s.id}`} className="panel" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{s.name}</div>
              <div className="muted" style={{ fontSize: 13, margin: '4px 0 10px' }}>
                {s.stepsJson.length} step{s.stepsJson.length !== 1 ? 's' : ''}{s.persona ? ` · ${s.persona}` : ''}
              </div>
              {/* Generation inputs summary (chips) — what produced this sequence. */}
              {(s.styleKey || s.painLabel || s.leadMagnetId) && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {s.styleKey && <Chip>{styleName(s.styleKey)}</Chip>}
                  {s.personaKey && <Chip>{personaName(s.personaKey)}</Chip>}
                  {s.painLabel && <Chip tone="pain">{s.painLabel}</Chip>}
                  {s.leadMagnetId && <Chip tone="offer">Offer</Chip>}
                  {s.abVariant && <Chip>A/B</Chip>}
                </div>
              )}
              {s.description && <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{s.description}</div>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: 'pain' | 'offer' }) {
  const bg = tone === 'pain' ? 'rgba(212,168,67,0.18)' : tone === 'offer' ? 'rgba(101,194,56,0.16)' : 'var(--surface-2, rgba(127,127,127,0.12))';
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: bg, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}
