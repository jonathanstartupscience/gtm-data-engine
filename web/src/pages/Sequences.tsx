import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type SequenceTemplate, type EmailStyle, type EmailPersonaInfo, type LeadMagnetInfo } from '../api.js';
import { PageHeader, EmptyState } from '../components/PageHeader.js';

/** Sequence Library — reusable message sequences, built independently and attached to campaigns. */
export function Sequences() {
  const [seqs, setSeqs] = useState<SequenceTemplate[]>([]);
  const [styles, setStyles] = useState<EmailStyle[]>([]);
  const [personas, setPersonas] = useState<EmailPersonaInfo[]>([]);
  const [magnets, setMagnets] = useState<LeadMagnetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Filters
  const [fStyle, setFStyle] = useState('');
  const [fPersona, setFPersona] = useState('');
  const [fPain, setFPain] = useState('');
  const [fOffer, setFOffer] = useState('');   // '', 'with', 'without'

  useEffect(() => {
    api.sequences().then((d) => setSeqs(d.sequences)).catch(() => setErr('Couldn’t load the sequence library — reload the page, and check your connection if it persists.')).finally(() => setLoading(false));
    api.emailStyles().then((d) => setStyles(d.styles)).catch(() => {});
    api.emailPersonas().then((d) => setPersonas(d.personas)).catch(() => {});
    api.leadMagnets().then((d) => setMagnets(d.leadMagnets)).catch(() => {});
  }, []);

  const styleName = (k: string | null) => styles.find((s) => s.key === k)?.name ?? k ?? '';
  const personaName = (k: string | null) => personas.find((p) => p.key === k)?.name ?? k ?? '';
  const magnetName = (id: string | null) => magnets.find((m) => m.id === id)?.title ?? 'Lead magnet';

  // Only offer filter facets that actually appear in the saved library, so filters never go empty.
  const presentStyles = useMemo(() => [...new Set(seqs.map((s) => s.styleKey).filter(Boolean))] as string[], [seqs]);
  const presentPersonas = useMemo(() => [...new Set(seqs.map((s) => s.personaKey).filter(Boolean))] as string[], [seqs]);
  // Pains scoped to the selected persona (pains are persona-specific), else all present pains.
  const presentPains = useMemo(
    () => [...new Map(
      seqs
        .filter((s) => s.painLabel && (!fPersona || s.personaKey === fPersona))
        .map((s) => [s.painKey, s.painLabel]),
    ).entries()] as [string, string][],
    [seqs, fPersona],
  );

  const filtered = seqs.filter((s) =>
    (!fStyle || s.styleKey === fStyle) &&
    (!fPersona || s.personaKey === fPersona) &&
    (!fPain || s.painKey === fPain) &&
    (!fOffer || (fOffer === 'with' ? !!s.leadMagnetId : !s.leadMagnetId)));

  const anyFilter = fStyle || fPersona || fPain || fOffer;
  const anyMeta = seqs.some((s) => s.styleKey || s.personaKey);
  const clearAll = () => { setFStyle(''); setFPersona(''); setFPain(''); setFOffer(''); };

  return (
    <>
      <PageHeader
        title="Sequences"
        sub="A campaign gets its own copy when you attach one — editing the campaign never changes the template."
        action={<Link to="/sequences/new" className="btn btn-primary">New sequence</Link>}
      />

      {err && <div className="callout callout-error mb-4">{err}</div>}

      {/* Filter bar — only shown once there's generation metadata to filter on. */}
      {anyMeta && (
        <div className="panel mb-4">
          <div className="toolbar mb-0" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted text-sm">Filter:</span>
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
              <button className="btn btn-sm" onClick={clearAll}>Clear</button>
            )}
            <span className="muted text-sm" style={{ marginLeft: 'auto' }}>{filtered.length} of {seqs.length}</span>
          </div>
        </div>
      )}

      {loading ? <div className="loading">Loading…</div> : seqs.length === 0 ? (
        <div className="panel">
          <EmptyState
            title="No sequences yet"
            hint="Write one by hand or with the AI writer, then attach it when you create a campaign."
            action={<Link to="/sequences/new" className="btn btn-primary">New sequence</Link>}
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel"><p className="muted">No sequences match these filters. <button className="btn btn-sm" onClick={clearAll}>Clear filters</button></p></div>
      ) : (
        <div className="seq-cards">
          {filtered.map((s) => {
            const cta = s.stepsJson[0]?.email_subject?.trim();
            const steps = s.stepsJson.length;
            return (
              <Link key={s.id} to={`/sequences/${s.id}`} className="seq-card">
                {/* Header: persona + style are the primary scan line */}
                <div className="seq-card-meta">
                  {s.personaKey && <span className="seq-pill seq-pill-persona">{personaName(s.personaKey)}</span>}
                  {s.styleKey && <span className="seq-pill seq-pill-style">{styleName(s.styleKey)}</span>}
                  {s.abVariant && <span className="seq-pill seq-pill-ab">A/B</span>}
                </div>

                <div className="seq-card-name">{s.name}</div>

                {/* CTA / hook: the first email's subject line — what the reader sees first */}
                {cta && (
                  <div className="seq-card-cta">
                    <span className="seq-card-cta-label">Subject</span>
                    <span className="seq-card-cta-text">{cta}</span>
                  </div>
                )}

                {/* Secondary tags: pain/angle and the named offer, each truncating cleanly */}
                {(s.painLabel || s.leadMagnetId) && (
                  <div className="seq-card-tags">
                    {s.painLabel && (
                      <span className="seq-tag seq-tag-pain" title={s.painLabel}>{s.painLabel}</span>
                    )}
                    {s.leadMagnetId && (
                      <span className="seq-tag seq-tag-offer" title={magnetName(s.leadMagnetId)}>
                        🎁 {magnetName(s.leadMagnetId)}
                      </span>
                    )}
                  </div>
                )}

                <div className="seq-card-foot">
                  <span>{steps} step{steps !== 1 ? 's' : ''}</span>
                  {s.senderMode && <span>· {s.senderMode === 'greg' ? 'From Greg' : 'Edify Greg'}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
