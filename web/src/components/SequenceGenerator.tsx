import { useEffect, useMemo, useState } from 'react';
import {
  api, type BuildStep, type EmailStyle, type SequenceMeta,
} from '../api.js';
import { useEmailLibraries } from '../hooks/useEmailLibraries.js';
import { CostBadge } from './CostBadge.js';

/** Styles where a specific pain/angle is the central lever (so we show the Pain picker). */
const PAIN_DRIVEN_STYLES = new Set(['pain-centric', 'insight-centric', 'benchmark-centric', 'trigger-centric']);

/**
 * "Write with AI" panel — pick a cold-email style + persona (+ optional lead magnet), and
 * Claude (Opus) drafts a full sequence in Gregory Shepard's voice. The result is handed back
 * via onGenerated so the parent loads it into the editable SequenceStepsEditor. This panel
 * never persists anything itself — saving is the parent's existing flow.
 *
 * This is the FROM-SCRATCH writer, shown only when creating a new sequence. Editing an existing
 * sequence uses SequenceRewriter (regenerate / per-step rewrite) instead — drafting tools don't
 * belong on the edit screen.
 *
 * Self-contained so it can be dropped into the Campaign Builder later with one line.
 */
export function SequenceGenerator({
  persona, onPersonaChange, onGenerated,
}: {
  /** Persona currently selected in the parent (kept in sync). */
  persona: string;
  onPersonaChange: (p: string) => void;
  /** Called with the generated steps + metadata when generation succeeds. */
  onGenerated: (r: { steps: BuildStep[]; rationale: string; style: string; persona: string; meta: SequenceMeta }) => void;
}) {
  const { styles, personas, magnets, error: loadErr } = useEmailLibraries();

  const [styleKey, setStyleKey] = useState('');
  const [personaKey, setPersonaKey] = useState('');
  const [painKey, setPainKey] = useState('');               // '' = AI uses the general pain
  const [painCustom, setPainCustom] = useState('');         // free-text override (wins over painKey)
  const [leadMagnetId, setLeadMagnetId] = useState('');     // '' = let AI pick
  const [sendingAsGreg, setSendingAsGreg] = useState(false); // default: edify Greg
  const [senderName, setSenderName] = useState('');
  const [abVariant, setAbVariant] = useState(false);
  const [extraContext, setExtraContext] = useState('');

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [lastRationale, setLastRationale] = useState('');
  const [showRationale, setShowRationale] = useState(false);

  // Sync the parent persona (preset/label) → our persona key when possible.
  useEffect(() => {
    if (!personas.length || !persona) return;
    const match = personas.find((p) =>
      p.presets.some((pre) => pre.toLowerCase() === persona.toLowerCase()) ||
      p.name.toLowerCase() === persona.toLowerCase() ||
      p.key === persona.toLowerCase());
    if (match) setPersonaKey(match.key);
  }, [personas, persona]);

  const style = useMemo(() => styles.find((s) => s.key === styleKey), [styles, styleKey]);
  const personaInfo = useMemo(() => personas.find((p) => p.key === personaKey), [personas, personaKey]);
  const coreStyles = styles.filter((s) => s.status === 'core');
  const betaStyles = styles.filter((s) => s.status === 'beta');
  const fitMagnets = useMemo(
    () => (personaKey ? magnets.filter((m) => m.personaFit.includes(personaKey)) : magnets),
    [magnets, personaKey],
  );

  const canGenerate = !!styleKey && !!personaKey && !generating;

  function pickPersona(key: string) {
    setPersonaKey(key);
    setPainKey(''); setPainCustom('');  // curated pains are persona-specific — reset on change
    const p = personas.find((x) => x.key === key);
    // Push a human label up to the parent's persona field when there's a natural preset.
    if (p) onPersonaChange(p.presets[0] ?? p.name);
  }

  const showsPain = !!style && PAIN_DRIVEN_STYLES.has(style.key);

  async function generate() {
    setGenerating(true); setError('');
    try {
      const showsPain = !!style && PAIN_DRIVEN_STYLES.has(style.key);
      const r = await api.generateSequence({
        styleKey, persona: personaKey,
        senderMode: sendingAsGreg ? 'greg' : 'edify',
        senderName: sendingAsGreg ? undefined : (senderName.trim() || undefined),
        leadMagnetId: style?.supportsOffer && leadMagnetId ? leadMagnetId : undefined,
        painKey: showsPain && painKey ? painKey : undefined,
        painCustom: showsPain && painCustom.trim() ? painCustom.trim() : undefined,
        abVariant: abVariant || undefined,
        extraContext: extraContext.trim() || undefined,
      });
      setLastRationale(r.rationale); setShowRationale(false);
      onGenerated(r);
    } catch (e) {
      const msg = String(e);
      setError(/\b400\b/.test(msg)
        ? 'Anthropic API key not configured. Add it under Settings, then try again.'
        : 'Generation failed: ' + msg);
    } finally {
      setGenerating(false);
    }
  }

  const planLine = style
    ? `${style.steps.length} step${style.steps.length > 1 ? 's' : ''} · ${style.steps.map((s) => s.waitDays).join('/')} days`
    : '';

  return (
    <div className="panel" style={{ marginBottom: 16, borderColor: 'var(--green)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>✨ Write with AI</h3>
        <CostBadge paid />
      </div>
      <p className="muted" style={{ marginTop: 4, marginBottom: 14 }}>
        Pick a proven cold-email style and a persona. Claude drafts the full sequence in Gregory Shepard's voice — then edit it below and save.
      </p>

      {loadErr && <p style={{ color: 'var(--coral)' }}>Couldn’t load the style library: {loadErr}</p>}

      {/* Style — selectable cards */}
      <label className="muted" style={{ display: 'block', marginBottom: 6 }}>Style</label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginBottom: 8 }}>
        {coreStyles.map((s) => <StyleCard key={s.key} s={s} active={s.key === styleKey} onPick={() => setStyleKey(s.key)} />)}
      </div>
      {betaStyles.length > 0 && (
        <>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 6px' }}>More styles (newer, less battle-tested)</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginBottom: 8 }}>
            {betaStyles.map((s) => <StyleCard key={s.key} s={s} active={s.key === styleKey} onPick={() => setStyleKey(s.key)} />)}
          </div>
        </>
      )}
      {style && (
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          Good for: {style.whenToUse} <span style={{ opacity: 0.6 }}>· {planLine}: {style.steps.map((s) => s.label).join(' → ')}</span>
        </p>
      )}

      {/* Persona */}
      <label className="muted" style={{ display: 'block', marginBottom: 6 }}>Persona</label>
      <select className="select" value={personaKey} onChange={(e) => pickPersona(e.target.value)} style={{ marginBottom: 6 }}>
        <option value="">Choose who you’re writing to…</option>
        {personas.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
      </select>
      {personaInfo && (
        <p className="muted" style={{ marginBottom: 14, fontSize: 13 }}>
          <strong>Pain:</strong> {personaInfo.pain}<br />
          <strong>What we offer:</strong> {personaInfo.value}
        </p>
      )}

      {/* Pain / angle (only for pain-driven styles, and once a persona is chosen) */}
      {showsPain && personaInfo && (
        <div style={{ marginBottom: 14 }}>
          <label className="muted" style={{ display: 'block', marginBottom: 6 }}>Specific pain / angle to focus on</label>
          <select className="select" value={painCustom ? '__custom__' : painKey}
            onChange={(e) => {
              if (e.target.value === '__custom__') { setPainKey(''); setPainCustom(' '); }
              else { setPainCustom(''); setPainKey(e.target.value); }
            }}>
            <option value="">Let AI use the general pain for this persona</option>
            {personaInfo.pains.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            <option value="__custom__">✏️ Write my own…</option>
          </select>
          {painCustom !== '' && (
            <input className="input" style={{ width: '100%', marginTop: 6 }}
              placeholder="Describe the specific pain or angle to lead with"
              value={painCustom} autoFocus onChange={(e) => setPainCustom(e.target.value)} />
          )}
        </div>
      )}

      {/* Offer (only for offer styles) */}
      {style?.supportsOffer && (
        <div style={{ marginBottom: 14 }}>
          <label className="muted" style={{ display: 'block', marginBottom: 6 }}>Lead magnet to offer</label>
          <select className="select" value={leadMagnetId} onChange={(e) => setLeadMagnetId(e.target.value)}>
            <option value="">Let AI pick the best fit</option>
            {fitMagnets.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
          {leadMagnetId && (
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{magnets.find((m) => m.id === leadMagnetId)?.hook}</p>
          )}
        </div>
      )}

      {/* Sender */}
      <label className="muted" style={{ display: 'block', marginBottom: 6 }}>Sender</label>
      <div className="toolbar" style={{ marginBottom: 6, alignItems: 'center' }}>
        <input className="input" placeholder="Sending as (name)" value={senderName}
          disabled={sendingAsGreg}
          onChange={(e) => setSenderName(e.target.value)} style={{ minWidth: 0, width: 220, opacity: sendingAsGreg ? 0.5 : 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={sendingAsGreg} onChange={(e) => setSendingAsGreg(e.target.checked)} />
          This inbox is Greg
        </label>
      </div>
      <p className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
        {sendingAsGreg
          ? 'Written in Greg’s first-person voice.'
          : 'Written as the sender, edifying Greg — every demo is with Greg personally, so his reputation carries the email.'}
      </p>

      {/* Options */}
      <div className="toolbar" style={{ marginBottom: 8, alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={abVariant} onChange={(e) => setAbVariant(e.target.checked)} />
          Also generate an A/B variant (step 1)
        </label>
      </div>
      <textarea className="input" style={{ width: '100%', minHeight: 60, fontFamily: 'inherit', resize: 'vertical', marginBottom: 12 }}
        placeholder="Optional: extra context — a real trigger, an angle to emphasize, a constraint…"
        value={extraContext} onChange={(e) => setExtraContext(e.target.value)} />

      {error && <p style={{ color: 'var(--coral)' }}>{error}</p>}
      {!styleKey || !personaKey ? <p className="muted">Pick a style and a persona to generate.</p> : null}

      <div className="toolbar" style={{ marginBottom: 0, alignItems: 'center' }}>
        <button className="btn btn-primary" disabled={!canGenerate} onClick={generate}>
          {generating ? <><span className="spinner" /> Writing…</> : 'Generate sequence'}
        </button>
        {lastRationale && !generating && (
          <button className="btn" onClick={() => setShowRationale((v) => !v)} style={{ padding: '4px 10px' }}>
            {showRationale ? 'Hide strategy' : 'Why this works'}
          </button>
        )}
      </div>
      {showRationale && lastRationale && (
        <p className="muted" style={{ marginTop: 10, fontSize: 13, fontStyle: 'italic' }}>{lastRationale}</p>
      )}
    </div>
  );
}

function StyleCard({ s, active, onPick }: { s: EmailStyle; active: boolean; onPick: () => void }) {
  return (
    <button type="button" onClick={onPick}
      style={{
        textAlign: 'left', cursor: 'pointer', padding: 12, borderRadius: 'var(--radius-sm)',
        border: `1px solid ${active ? 'var(--green)' : 'var(--border)'}`,
        background: active ? 'rgba(101,194,56,0.10)' : 'transparent',
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
      <strong style={{ fontSize: 14 }}>{s.name}</strong>
      <span className="muted" style={{ fontSize: 12, lineHeight: 1.35 }}>{s.summary}</span>
    </button>
  );
}
