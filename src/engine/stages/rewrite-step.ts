/**
 * Rewrite-step stage — take one existing cold-email step and apply a targeted rewrite
 * (tighten / shorten / punch up the subject / more Greg / custom instruction) in Greg's voice.
 * The counterpart to generate-sequence.ts: that drafts a whole sequence, this edits one email.
 *
 * The LLM call is injected (completeFn) so the brain is swappable and this file has no
 * API-key dependency, mirroring generate-sequence.
 */
import { buildRewritePrompt, type RewriteAction } from '../email/buildRewritePrompt.js';
import { getStyle } from '../email/styles.js';
import { resolveEmailPersona, getEmailPersona } from '../email/personas.js';
import type { SenderMode } from '../email/voice.js';

export interface RewriteStepResult {
  email_subject: string;
  email_body: string;
  note: string;
}

export interface RewriteStepOpts {
  emailSubject: string;
  emailBody: string;
  action: RewriteAction;
  /** Required when action is 'custom'. */
  instruction?: string;
  senderMode: SenderMode;
  senderName?: string;
  /** Optional generation context — present when the sequence carries metadata. */
  styleKey?: string;
  /** Persona key OR a free-text persona/preset string. */
  persona?: string;
}

/** completeFn: send a prompt to the model, get raw text back. */
export type CompleteFn = (prompt: string) => Promise<string>;
/** jsonFn: pull the first balanced JSON object out of model text. */
export type JsonFn = <T = unknown>(text: string) => T | null;

interface RawOutput {
  email_subject?: unknown;
  email_body?: unknown;
  note?: unknown;
}

/** Validate + coerce the model output. Throws on unusable output. */
function validate(raw: RawOutput | null): RewriteStepResult {
  const subject = String(raw?.email_subject ?? '').trim();
  const body = String(raw?.email_body ?? '').trim();
  if (!subject || !body) throw new Error('Model returned an empty subject or body');
  return {
    // Clamp to the same bounds the sequence step schema enforces (subject 300, body 20000).
    email_subject: subject.slice(0, 300),
    email_body: body.slice(0, 20000),
    note: String(raw?.note ?? '').trim().slice(0, 500),
  };
}

export async function rewriteStep(
  opts: RewriteStepOpts,
  completeFn: CompleteFn,
  jsonFn: JsonFn,
  log: (m: string) => void = console.log,
): Promise<RewriteStepResult> {
  if (!opts.emailSubject.trim() && !opts.emailBody.trim()) {
    throw new Error('Nothing to rewrite — the step has no subject or body');
  }
  if (opts.action === 'custom' && !opts.instruction?.trim()) {
    throw new Error('A custom rewrite needs an instruction');
  }

  // Style/persona are best-effort context; a hand-built sequence may carry neither.
  const style = opts.styleKey ? getStyle(opts.styleKey) : undefined;
  const persona = opts.persona
    ? getEmailPersona(opts.persona) ?? resolveEmailPersona(opts.persona)
    : undefined;

  const prompt = buildRewritePrompt({
    emailSubject: opts.emailSubject,
    emailBody: opts.emailBody,
    action: opts.action,
    instruction: opts.instruction,
    senderMode: opts.senderMode,
    senderName: opts.senderName,
    style, persona,
  });

  log(`Rewriting step (${opts.action})…`);

  // One retry: malformed JSON gets a corrective nudge before we give up.
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await completeFn(
      attempt === 1 ? prompt : `${prompt}\n\nYour previous reply was not valid JSON. Reply with ONLY the JSON object.`,
    );
    const raw = jsonFn<RawOutput>(text);
    try {
      const result = validate(raw);
      log('Rewrote step.');
      return result;
    } catch (e) {
      lastErr = e as Error;
      log(`  attempt ${attempt} invalid: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error('Step rewrite failed');
}
