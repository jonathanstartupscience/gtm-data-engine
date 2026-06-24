import { useState } from 'react';
import { api, type BuildStep, type SequenceMeta } from '../api.js';
import { CostBadge } from './CostBadge.js';

/**
 * Edit-mode AI assistant — a collapsed, secondary panel shown when editing an existing sequence.
 * Unlike SequenceGenerator (the from-scratch writer), this does not re-ask for style/persona:
 * it redrafts the WHOLE sequence one-click from the inputs already saved on the template (`meta`),
 * reusing the existing /sequences/generate endpoint. Per-step rewrites live inline in the steps
 * editor; this panel covers the "throw it away and redraft" case.
 *
 * If the sequence carries no generation metadata (hand-built), whole-sequence regenerate isn't
 * possible — we say so and point to the per-step rewrite actions instead.
 */
export function SequenceRewriter({
  meta, onRegenerated,
}: {
  meta: SequenceMeta | null;
  onRegenerated: (r: { steps: BuildStep[]; rationale: string; style: string; persona: string; meta: SequenceMeta }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canRegenerate = !!(meta?.styleKey && meta?.personaKey);

  async function regenerate() {
    if (!meta?.styleKey || !meta?.personaKey) return;
    if (!confirm('Replace every step with a freshly generated sequence? Your current edits will be lost.')) return;
    setBusy(true); setError('');
    try {
      const r = await api.generateSequence({
        styleKey: meta.styleKey, persona: meta.personaKey,
        senderMode: meta.senderMode ?? 'edify',
        leadMagnetId: meta.leadMagnetId || undefined,
        painKey: meta.painKey && meta.painKey !== 'custom' ? meta.painKey : undefined,
        painCustom: meta.painKey === 'custom' && meta.painLabel ? meta.painLabel : undefined,
        abVariant: meta.abVariant || undefined,
      });
      onRegenerated(r);
    } catch (e) {
      const msg = String(e);
      setError(/\b400\b/.test(msg)
        ? 'Anthropic API key not configured. Add it under Settings, then try again.'
        : 'Regeneration failed: ' + msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <span style={{ fontWeight: 600 }}>↻ Rewrite with AI</span>
        <CostBadge paid />
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 13 }}>{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 12 }}>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Tighten or rework individual emails with the <strong>✨ Rewrite</strong> actions under each step above.
            To redraft the entire sequence from scratch, regenerate it below.
          </p>
          {canRegenerate ? (
            <>
              <button className="btn btn-primary" disabled={busy} onClick={regenerate}>
                {busy ? <><span className="spinner" /> Regenerating…</> : '↻ Regenerate whole sequence'}
              </button>
              <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                Uses the saved inputs: {[meta?.styleKey, meta?.personaKey, meta?.painLabel].filter(Boolean).join(' · ')}.
                Replaces all steps.
              </p>
            </>
          ) : (
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              This sequence was built by hand (no saved style or persona), so there's nothing to regenerate from.
              Use the per-step rewrite actions above to edit it with AI.
            </p>
          )}
          {error && <p style={{ color: 'var(--coral)', marginTop: 10 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
