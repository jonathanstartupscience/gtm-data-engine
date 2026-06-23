import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type BuildStep, type SequenceMeta } from '../api.js';
import { SequenceStepsEditor, blankStep } from '../components/SequenceStepsEditor.js';
import { SequenceGenerator } from '../components/SequenceGenerator.js';

const PERSONAS = ['', 'ESO Leadership', 'ESO Program', 'ESO Partnerships', 'ESO Founder/GP'];

/** Create or edit a reusable sequence template (route: /sequences/new or /sequences/:id). */
export function SequenceBuilder() {
  const { id } = useParams();
  const editing = id && id !== 'new' ? Number(id) : null;
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [persona, setPersona] = useState('');
  const [steps, setSteps] = useState<BuildStep[]>([blankStep(1)]);
  const [meta, setMeta] = useState<SequenceMeta | null>(null);   // generation inputs, carried to save
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(!editing);

  useEffect(() => {
    if (!editing) return;
    api.sequence(editing).then((d) => {
      const s = d.sequence;
      setName(s.name); setDescription(s.description ?? '');
      setPersona(s.persona ?? ''); setSteps(s.stepsJson?.length ? s.stepsJson : [blankStep(1)]);
      // Preserve existing generation metadata on edit so re-saving doesn't wipe it.
      if (s.styleKey || s.painKey || s.genModel) {
        setMeta({
          styleKey: s.styleKey ?? undefined, personaKey: s.personaKey ?? undefined,
          painKey: s.painKey ?? undefined, painLabel: s.painLabel ?? undefined,
          leadMagnetId: s.leadMagnetId ?? undefined,
          senderMode: (s.senderMode as 'greg' | 'edify' | null) ?? undefined,
          abVariant: s.abVariant ?? undefined, rationale: s.rationale ?? undefined,
          genModel: s.genModel ?? undefined,
        });
      }
    }).catch((e) => setError(String(e))).finally(() => setLoaded(true));
  }, [editing]);

  const hasSteps = steps.some((s) => s.email_subject.trim() || s.email_body.trim());
  const valid = name.trim() && steps.every((s) => s.email_subject.trim() && s.email_body.trim());

  /** Load an AI-generated sequence into the editor; prefill name/description + capture inputs. */
  function applyGenerated(r: { steps: BuildStep[]; rationale: string; style: string; persona: string; meta: SequenceMeta }) {
    setSteps(r.steps.map((s, i) => ({ ...s, order: s.order ?? i + 1 })));
    if (!name.trim()) setName(`${r.persona} · ${r.style}${r.meta.painLabel ? ` · ${r.meta.painLabel}` : ''}`);
    if (!description.trim() && r.rationale) setDescription(r.rationale.split('. ')[0]);
    setMeta({ ...r.meta, rationale: r.rationale });
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const body = { name: name.trim(), description: description || undefined, persona: persona || undefined, steps, meta: meta ?? undefined };
      if (editing) await api.updateSequence(editing, body);
      else await api.saveSequence(body);
      navigate('/sequences');
    } catch (e) { setError(String(e)); setSaving(false); }
  }

  async function remove() {
    if (!editing) return;
    if (!confirm('Delete this sequence template?')) return;
    await api.deleteSequence(editing);
    navigate('/sequences');
  }

  if (!loaded) return <div className="loading">Loading…</div>;

  return (
    <>
      <h1 className="page-title">{editing ? 'Edit sequence' : 'New sequence'}</h1>
      <p className="page-sub">Build a reusable message sequence. Attach it to a campaign later — the campaign gets its own copy.</p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Details</h3>
        <input className="input" style={{ width: '100%', marginBottom: 8 }} placeholder="Sequence name — e.g. ESO Leadership · 4-touch value-first"
          value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" style={{ width: '100%', marginBottom: 8 }} placeholder="Description (optional) — what this sequence is testing"
          value={description} onChange={(e) => setDescription(e.target.value)} />
        <select className="select" value={persona} onChange={(e) => setPersona(e.target.value)}>
          {PERSONAS.map((p) => <option key={p} value={p}>{p || 'Any persona'}</option>)}
        </select>
      </div>

      {meta?.genModel && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Generated from</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: meta.rationale ? 10 : 0 }}>
            {meta.styleKey && <MetaChip>Style: {meta.styleKey}</MetaChip>}
            {meta.personaKey && <MetaChip>Persona: {meta.personaKey}</MetaChip>}
            {meta.painLabel && <MetaChip>Pain: {meta.painLabel}</MetaChip>}
            {meta.leadMagnetId && <MetaChip>Offer: {meta.leadMagnetId}</MetaChip>}
            {meta.senderMode && <MetaChip>{meta.senderMode === 'greg' ? 'As Greg' : 'Edify Greg'}</MetaChip>}
            {meta.abVariant && <MetaChip>A/B</MetaChip>}
          </div>
          {meta.rationale && <p className="muted" style={{ fontSize: 13, fontStyle: 'italic', margin: 0 }}>{meta.rationale}</p>}
        </div>
      )}

      <SequenceGenerator
        persona={persona}
        onPersonaChange={setPersona}
        hasExistingSteps={hasSteps}
        onGenerated={applyGenerated}
      />

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>Steps</h3>
        <SequenceStepsEditor steps={steps} onChange={setSteps} />
      </div>

      <div className="panel">
        {error && <p style={{ color: 'var(--coral)' }}>{error}</p>}
        {!valid && <p className="muted">Name is required and every step needs a subject and body.</p>}
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <button className="btn btn-primary" disabled={!valid || saving} onClick={save}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create sequence'}
          </button>
          {editing && <button className="btn" onClick={remove} style={{ color: 'var(--coral)' }}>Delete</button>}
        </div>
      </div>
    </>
  );
}

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 999, background: 'var(--surface-2, rgba(127,127,127,0.12))', whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}
