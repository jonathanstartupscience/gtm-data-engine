import type { BuildStep } from '../api.js';

export const SEQUENCE_VARS = ['{{first_name}}', '{{last_name}}', '{{company}}', '{{title}}', '{{persona}}', '{{sub_type}}'];

export function blankStep(order: number): BuildStep {
  return { order, wait_in_days: order === 1 ? 0 : 3, email_subject: '', email_body: '' };
}

/** Shared multi-step email-sequence editor (used by the Sequence Builder and inline elsewhere). */
export function SequenceStepsEditor({ steps, onChange }: { steps: BuildStep[]; onChange: (s: BuildStep[]) => void }) {
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
            placeholder="Email body…  Hi {{first_name}}, …"
            value={s.email_body} onChange={(e) => setStep(i, { email_body: e.target.value })} />
        </div>
      ))}
      <button className="btn" onClick={addStep}>+ Add step</button>
    </>
  );
}
