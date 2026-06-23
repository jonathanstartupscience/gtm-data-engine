/**
 * Generate-sequence stage — turn a (style × persona [× offer]) selection into a full
 * multi-step cold-email sequence in Greg's voice. The strategy is fixed by the style
 * skeleton; the model writes the copy. Output validates against the skeleton before return.
 *
 * The LLM call is injected (completeFn) so the brain is swappable and this file has no
 * API-key dependency, mirroring the classify stage.
 */
import { buildSequencePrompt } from '../email/buildPrompt.js';
import { getStyle, type ColdEmailStyle } from '../email/styles.js';
import { resolveEmailPersona, getEmailPersona, resolvePain, type EmailPersona } from '../email/personas.js';
import { getLeadMagnet } from '../email/leadMagnets.js';
import type { SenderMode } from '../email/voice.js';

export interface GeneratedStep {
  order: number;
  wait_in_days: number;
  email_subject: string;
  email_body: string;
  variant?: string;
}
export interface GenerateSequenceResult {
  steps: GeneratedStep[];
  rationale: string;
  styleKey: string;
  styleName: string;
  personaKey: string;
  personaName: string;
  /** Resolved pain that was targeted (curated key or 'custom'), null if none. */
  painKey: string | null;
  painLabel: string | null;
  leadMagnetId: string | null;
  senderMode: SenderMode;
  abVariant: boolean;
}

export interface GenerateSequenceOpts {
  styleKey: string;
  /** Persona key OR a free-text persona/preset/type string. */
  persona: string;
  senderMode: SenderMode;
  senderName?: string;
  leadMagnetId?: string;
  /** Curated sub-pain key to focus on (see persona.pains). */
  painKey?: string;
  /** Free-text pain/angle; overrides painKey when set. */
  painCustom?: string;
  abVariant?: boolean;
  extraContext?: string;
}

/** completeFn: send a prompt to the model, get raw text back. */
export type CompleteFn = (prompt: string) => Promise<string>;
/** jsonFn: pull the first balanced JSON object out of model text. */
export type JsonFn = <T = unknown>(text: string) => T | null;

interface RawOutput {
  rationale?: unknown;
  steps?: { order?: unknown; wait_in_days?: unknown; email_subject?: unknown; email_body?: unknown; variant?: unknown }[];
}

/** Validate + coerce the model output against the style skeleton. Throws on unusable output. */
function validate(raw: RawOutput | null, style: ColdEmailStyle): { steps: GeneratedStep[]; rationale: string } {
  if (!raw || !Array.isArray(raw.steps) || raw.steps.length === 0) {
    throw new Error('Model returned no usable steps');
  }
  const steps: GeneratedStep[] = raw.steps
    .map((s) => ({
      order: Number(s.order),
      wait_in_days: Number(s.wait_in_days),
      email_subject: String(s.email_subject ?? '').trim(),
      email_body: String(s.email_body ?? '').trim(),
      variant: s.variant ? String(s.variant).trim().slice(0, 20) : undefined,
    }))
    .filter((s) => Number.isFinite(s.order) && s.email_subject && s.email_body)
    .map((s) => ({
      ...s,
      wait_in_days: Number.isFinite(s.wait_in_days) ? Math.max(0, Math.min(90, s.wait_in_days)) : 0,
    }))
    .sort((a, b) => a.order - b.order || (a.variant ?? '').localeCompare(b.variant ?? ''));

  // Must cover every primary (non-B-variant) step the skeleton defines.
  const primaryCount = steps.filter((s) => s.variant !== 'B').length;
  if (primaryCount < style.steps.length) {
    throw new Error(`Model returned ${primaryCount} steps; the ${style.name} style needs ${style.steps.length}`);
  }
  return { steps, rationale: String(raw.rationale ?? '').trim() };
}

export async function generateSequence(
  opts: GenerateSequenceOpts,
  completeFn: CompleteFn,
  jsonFn: JsonFn,
  log: (m: string) => void = console.log,
): Promise<GenerateSequenceResult> {
  const style = getStyle(opts.styleKey);
  if (!style) throw new Error(`Unknown cold-email style: ${opts.styleKey}`);

  const persona: EmailPersona | undefined = getEmailPersona(opts.persona) ?? resolveEmailPersona(opts.persona);
  if (!persona) throw new Error(`Unknown persona: ${opts.persona}`);

  const leadMagnet = opts.leadMagnetId ? getLeadMagnet(opts.leadMagnetId) : undefined;
  if (opts.leadMagnetId && !leadMagnet) throw new Error(`Unknown lead magnet: ${opts.leadMagnetId}`);
  if (leadMagnet && !style.supportsOffer) {
    throw new Error(`The ${style.name} style does not use a lead magnet`);
  }

  const pain = resolvePain(persona, opts.painKey, opts.painCustom);

  const prompt = buildSequencePrompt({
    style, persona, leadMagnet, painLabel: pain?.label,
    senderMode: opts.senderMode, senderName: opts.senderName,
    abVariant: opts.abVariant, extraContext: opts.extraContext,
  });

  log(`Generating ${style.name} sequence for ${persona.name}…`);

  // One retry: malformed JSON gets a corrective nudge before we give up.
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const text = await completeFn(attempt === 1 ? prompt : `${prompt}\n\nYour previous reply was not valid JSON. Reply with ONLY the JSON object.`);
    const raw = jsonFn<RawOutput>(text);
    try {
      const { steps, rationale } = validate(raw, style);
      log(`Generated ${steps.length} step(s).`);
      return {
        steps, rationale,
        styleKey: style.key, styleName: style.name,
        personaKey: persona.key, personaName: persona.name,
        painKey: pain?.key ?? null, painLabel: pain?.label ?? null,
        leadMagnetId: leadMagnet?.id ?? null,
        senderMode: opts.senderMode, abVariant: !!opts.abVariant,
      };
    } catch (e) {
      lastErr = e as Error;
      log(`  attempt ${attempt} invalid: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error('Sequence generation failed');
}
