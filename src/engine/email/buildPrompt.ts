/**
 * Assembles the cold-email sequence generation prompt from the IP data layer:
 * voice + persona + style skeleton + (optional) lead-magnet offer + sender mode.
 * Pure function, no I/O — the stage calls this then sends the result to Claude.
 */
import {
  GREG_BIO, VOICE_ONE_LINE, VOICE_PRINCIPLES, ANTI_PATTERNS, CORE_THEMES,
  senderVoice, type SenderMode,
} from './voice.js';
import { type EmailPersona } from './personas.js';
import { type ColdEmailStyle } from './styles.js';
import { SHARED_RULES } from './styles.js';
import { type LeadMagnet } from './leadMagnets.js';

export interface BuildPromptArgs {
  style: ColdEmailStyle;
  persona: EmailPersona;
  senderMode: SenderMode;
  senderName?: string;
  leadMagnet?: LeadMagnet;
  /** The specific pain/angle to focus on (resolved label). Sharpens pain/insight/benchmark styles. */
  painLabel?: string;
  /** Generate an A/B variant set (alternate subject + opener for step 1) in addition to the A version. */
  abVariant?: boolean;
  /** Optional free-text the user adds (a real trigger, a constraint, an angle to emphasize). */
  extraContext?: string;
}

const bullets = (items: readonly string[]): string => items.map((i) => `- ${i}`).join('\n');

/** Build the full instruction prompt. The model must reply with ONLY the JSON contract below. */
export function buildSequencePrompt(a: BuildPromptArgs): string {
  const { style, persona, leadMagnet, painLabel, abVariant, extraContext } = a;

  const stepPlan = style.steps
    .map((s) => `  Step ${s.order} (wait ${s.waitDays} days) — ${s.label}: ${s.job}`)
    .join('\n');

  const variantNote = abVariant
    ? 'ALSO produce an A/B variant: for step 1 only, add a second object with the SAME order and wait_in_days but variant "B", a different subject line, and a different opening angle. Mark the primary step 1 with variant "A". All other steps have no variant.'
    : 'Do not produce A/B variants; omit the variant field.';

  const offerBlock = leadMagnet
    ? [
        '',
        'LEAD MAGNET TO OFFER (attribute to Greg):',
        `- Title: ${leadMagnet.title}`,
        `- What it gives the reader: ${leadMagnet.hook}`,
        'Use a {{magnet_link}} merge tag where a download link belongs.',
      ].join('\n')
    : '';

  return [
    'You are a world-class cold-email copywriter writing for the Startup Science GTM team. You write the entire sequence as plain-text emails (no HTML).',
    '',
    'SENDER & VOICE',
    senderVoice(a.senderMode, a.senderName),
    `Voice in one sentence: ${VOICE_ONE_LINE}`,
    'About Gregory Shepard (the credibility this copy leans on — use ONE sharp proof point, never a stack):',
    `- ${GREG_BIO.oneLine}`,
    bullets(GREG_BIO.proofPoints.map((p) => p)),
    `Platform proof (use sparingly, only for authority/peer angles): ${GREG_BIO.platformProof.join('; ')}.`,
    '',
    'VOICE PRINCIPLES',
    bullets(VOICE_PRINCIPLES),
    '',
    'STARTUP SCIENCE THEMES (reference only when they genuinely fit this persona):',
    bullets(CORE_THEMES),
    '',
    'ANTI-PATTERNS — every one of these reads as AI-generated and kills cold email. Eliminate all of them:',
    bullets(ANTI_PATTERNS),
    '',
    'AUDIENCE / PERSONA',
    `- Persona: ${persona.name} — ${persona.blurb}`,
    `- Their pain: ${persona.pain}`,
    painLabel ? `- FOCUS THIS SEQUENCE ON THIS SPECIFIC PAIN/ANGLE: "${painLabel}". Make it the through-line; other pains are secondary.` : '',
    `- What we offer them: ${persona.value}`,
    `- How the Startup Lifecycle speaks to them: ${persona.lifecycleAngle}`,
    `- Subject-line directions to riff on (do not copy verbatim): ${persona.subjectAngles.join(' | ')}`,
    '',
    `STYLE: ${style.name}`,
    `- Summary: ${style.summary}`,
    `- Subject guidance: ${style.subjectGuidance}`,
    'Style rules:',
    bullets(style.rules),
    '',
    'HOUSE RULES (apply to every email):',
    bullets(SHARED_RULES),
    offerBlock,
    extraContext?.trim() ? `\nEXTRA CONTEXT FROM THE SENDER (weave in naturally):\n${extraContext.trim()}` : '',
    '',
    'SEQUENCE SKELETON — follow exactly. Each step is one email with the stated job and wait:',
    stepPlan,
    '',
    variantNote,
    '',
    'OUTPUT CONTRACT — respond with ONLY a single JSON object, no prose before or after:',
    '{',
    '  "rationale": "<2-3 sentences on the strategy you used for this persona+style>",',
    '  "steps": [',
    '    { "order": <int>, "wait_in_days": <int>, "email_subject": "<string>", "email_body": "<string with merge tags and a signature>", "variant": "<optional A or B>" }',
    '  ]',
    '}',
    'The number of primary steps must match the skeleton exactly. Keep merge tags in {{double_brace}} form. Do not use em dashes anywhere.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}
