import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type BuildStep } from '../api.js';
import { SequenceStepsEditor, blankStep } from '../components/SequenceStepsEditor.js';

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(!editing);

  useEffect(() => {
    if (!editing) return;
    api.sequence(editing).then((d) => {
      setName(d.sequence.name); setDescription(d.sequence.description ?? '');
      setPersona(d.sequence.persona ?? ''); setSteps(d.sequence.stepsJson?.length ? d.sequence.stepsJson : [blankStep(1)]);
    }).catch((e) => setError(String(e))).finally(() => setLoaded(true));
  }, [editing]);

  const valid = name.trim() && steps.every((s) => s.email_subject.trim() && s.email_body.trim());

  async function save() {
    setSaving(true); setError('');
    try {
      const body = { name: name.trim(), description: description || undefined, persona: persona || undefined, steps };
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
