import { useState } from 'react';
import type { BuildStep, RewriteAction } from '../api.js';

// Single-brace UPPERCASE — the dialect this Bison instance renders. ({TRIGGER} has no value on push
// (renders blank); {MAGNET_LINK} is offer-only and offers are reply-to-receive — so neither is shown
// in the picker, though both still resolve if hand-typed.)
export const SEQUENCE_VARS = ['{FIRST_NAME}', '{LAST_NAME}', '{COMPANY}', '{TITLE}', '{PERSONA}', '{SUB_TYPE}'];

export function blankStep(order: number): BuildStep {
  return { order, wait_in_days: order === 1 ? 0 : 3, email_subject: '', email_body: '' };
}

/** Quick rewrite actions surfaced per step on the edit screen. */
const REWRITE_ACTIONS: { action: RewriteAction; label: string }[] = [
  { action: 'tighten', label: 'Tighten' },
  { action: 'shorten', label: 'Shorten' },
  { action: 'punch-subject', label: 'Punch up subject' },
  { action: 'more-greg', label: 'More Greg' },
];

/**
 * Shared multi-step email-sequence editor (used by the Sequence Builder and inline elsewhere).
 * When `onRewrite` is supplied (edit screen only), each step gets one-click AI rewrite actions
 * that hand the step's copy + chosen action up to the parent; the parent calls the API and
 * patches the returned subject/body back in. Without it (create screen), no rewrite UI shows.
 */
export function SequenceStepsEditor({
  steps, onChange, onRewrite,
}: {
  steps: BuildStep[];
  onChange: (s: BuildStep[]) => void;
  onRewrite?: (index: number, action: RewriteAction, instruction?: string) => Promise<void>;
}) {
  const setStep = (i: number, patch: Partial<BuildStep>) =>
    onChange(steps.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
  const addStep = () => onChange([...steps, blankStep(steps.length + 1)]);
  const removeStep = (i: number) => onChange(steps.filter((_, idx) => idx !== i).map((st, idx) => ({ ...st, order: idx + 1 })));

  return (
    <>
      <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
        Personalize with: {SEQUENCE_VARS.map((v) => <code key={v} style={{ marginRight: 6 }}>{v}</code>)}
      </p>
      {steps.map((s, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>Step {s.order}</strong>
            <div className="toolbar" style={{ marginBottom: 0, alignItems: 'center' }}>
              <label className="muted">Wait
                <input className="input" type="number" min={0} max={90} value={s.wait_in_days}
                  onChange={(e) => setStep(i, { wait_in_days: Number(e.target.value) })}
                  style={{ minWidth: 0, width: 70, marginLeft: 6 }} /> days
              </label>
              <input className="input" placeholder="variant (A/B)" value={s.variant ?? ''}
                onChange={(e) => setStep(i, { variant: e.target.value || undefined })}
                style={{ minWidth: 0, width: 110 }} />
              {steps.length > 1 && <button className="btn" onClick={() => removeStep(i)} style={{ padding: '4px 10px' }}>Remove</button>}
            </div>
          </div>
          <input className="input" style={{ width: '100%', marginBottom: 8 }} placeholder="Subject line"
            value={s.email_subject} onChange={(e) => setStep(i, { email_subject: e.target.value })} />
          <textarea className="input" style={{ width: '100%', minHeight: 140, fontFamily: 'inherit', resize: 'vertical' }}
            placeholder="Email body…  Hi {FIRST_NAME}, …"
            value={s.email_body} onChange={(e) => setStep(i, { email_body: e.target.value })} />
          {onRewrite && <StepRewriteBar index={i} step={s} onRewrite={onRewrite} />}
        </div>
      ))}
      <button className="btn" onClick={addStep}>+ Add step</button>
    </>
  );
}

/** Per-step AI rewrite action row. Disabled until the step has a body to work from. */
function StepRewriteBar({
  index, step, onRewrite,
}: {
  index: number;
  step: BuildStep;
  onRewrite: (index: number, action: RewriteAction, instruction?: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<RewriteAction | null>(null);
  const [error, setError] = useState('');
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const hasBody = !!step.email_body.trim();
  const disabled = !hasBody || busy !== null;

  async function run(action: RewriteAction, instruction?: string) {
    if (action === 'custom' && !instruction?.trim()) return;
    setBusy(action); setError('');
    try {
      await onRewrite(index, action, instruction);
      if (action === 'custom') { setCustom(''); setShowCustom(false); }
    } catch (e) {
      setError(String(e).replace(/^Error:\s*/, ''));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ marginTop: 10, borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
      <div className="toolbar bare" style={{ marginBottom: 0, alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <span className="muted" style={{ fontSize: 12 }}>✨ Rewrite:</span>
        {REWRITE_ACTIONS.map((a) => (
          <button key={a.action} className="btn" style={{ padding: '3px 10px', fontSize: 12 }}
            disabled={disabled} onClick={() => run(a.action)}>
            {busy === a.action ? <><span className="spinner" /> …</> : a.label}
          </button>
        ))}
        <button className="btn" style={{ padding: '3px 10px', fontSize: 12 }}
          disabled={busy !== null} onClick={() => setShowCustom((v) => !v)}>
          {showCustom ? 'Cancel' : 'Custom…'}
        </button>
      </div>
      {showCustom && (
        <div className="toolbar" style={{ marginTop: 6, marginBottom: 0, alignItems: 'center', gap: 6 }}>
          <input className="input" style={{ flex: 1, minWidth: 0 }}
            placeholder="Tell the AI what to change — e.g. lead with the benchmark stat"
            value={custom} autoFocus disabled={busy !== null}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run('custom', custom); }} />
          <button className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 12 }}
            disabled={disabled || !custom.trim()} onClick={() => run('custom', custom)}>
            {busy === 'custom' ? <><span className="spinner" /> …</> : 'Apply'}
          </button>
        </div>
      )}
      {!hasBody && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>Add a subject and body first to rewrite this step.</p>}
      {error && <p style={{ color: 'var(--coral)', fontSize: 12, margin: '6px 0 0' }}>{error}</p>}
    </div>
  );
}
