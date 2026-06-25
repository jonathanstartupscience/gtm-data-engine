/**
 * Assembles the prompt to REWRITE a single existing cold-email step in Greg's voice.
 * The counterpart to buildPrompt.ts (which drafts a whole sequence from scratch): here the
 * copy already exists and the user wants a targeted edit (tighten, shorten, punch up the
 * subject, make it more Greg, or a free-text instruction). We keep the same voice + anti-pattern
 * IP so a rewrite never drifts off-brand, but we touch only the one email handed in.
 *
 * Pure function, no I/O — the stage calls this then sends the result to Claude.
 * Style/persona are optional: a hand-built sequence may carry no generation metadata, and a
 * rewrite must still work, leaning on voice alone.
 */
import {
  VOICE_ONE_LINE, VOICE_PRINCIPLES, ANTI_PATTERNS, senderVoice, type SenderMode,
} from './voice.js';
import { type EmailPersona } from './personas.js';
import { type ColdEmailStyle } from './styles.js';
import { SHARED_RULES } from './styles.js';

/** The fixed set of one-click rewrite actions, plus free-text custom. */
export type RewriteAction = 'tighten' | 'shorten' | 'punch-subject' | 'more-greg' | 'custom';

export interface BuildRewriteArgs {
  emailSubject: string;
  emailBody: string;
  action: RewriteAction;
  /** Free-text instruction; required when action is 'custom', ignored otherwise. */
  instruction?: string;
  senderMode: SenderMode;
  senderName?: string;
  /** Optional generation context — sharpens the rewrite when the sequence carries metadata. */
  style?: ColdEmailStyle;
  persona?: EmailPersona;
}

const bullets = (items: readonly string[]): string => items.map((i) => `- ${i}`).join('\n');

/** Human instruction for each canned action. Custom falls back to the user's own instruction. */
function actionInstruction(action: RewriteAction, instruction?: string): string {
  switch (action) {
    case 'tighten':
      return 'TIGHTEN this email: cut every word that does not earn its place, remove hedging and filler, and sharpen the verbs. Keep the same message, structure, and ask. Do not make it generic.';
    case 'shorten':
      return 'SHORTEN this email substantially (aim for roughly half the length) while keeping the single most important point and the call to action. Cut whole sentences, not just words.';
    case 'punch-subject':
      return 'Rewrite ONLY the subject line to be sharper and more likely to be opened — concrete, specific, lowercase-casual is fine, no clickbait. Leave the email body exactly as it is (return it unchanged).';
    case 'more-greg':
      return "Rewrite this email to sound more like Gregory Shepard: more direct, more calm authority, frameworks over advice, one sharp proof point instead of a stack. Same message and ask, stronger voice.";
    case 'custom':
      return `Apply this specific instruction from the sender to the email: "${(instruction ?? '').trim()}". Keep everything else intact unless the instruction says otherwise.`;
  }
}

/** Build the rewrite prompt. The model must reply with ONLY the JSON contract below. */
export function buildRewritePrompt(a: BuildRewriteArgs): string {
  const { style, persona } = a;

  const styleBlock = style
    ? [
        '',
        `STYLE THIS EMAIL BELONGS TO: ${style.name}`,
        `- Summary: ${style.summary}`,
        `- Subject guidance: ${style.subjectGuidance}`,
        'Style rules to keep honoring:',
        bullets(style.rules),
      ].join('\n')
    : '';

  const personaBlock = persona
    ? [
        '',
        'AUDIENCE / PERSONA',
        `- Persona: ${persona.name} — ${persona.blurb}`,
        `- Their pain: ${persona.pain}`,
        `- What we offer them: ${persona.value}`,
      ].join('\n')
    : '';

  return [
    'You are a world-class cold-email copywriter writing for the Startup Science GTM team. You are editing ONE existing plain-text email (no HTML), not writing a new sequence.',
    '',
    'SENDER & VOICE',
    senderVoice(a.senderMode, a.senderName),
    `Voice in one sentence: ${VOICE_ONE_LINE}`,
    '',
    'VOICE PRINCIPLES',
    bullets(VOICE_PRINCIPLES),
    '',
    'ANTI-PATTERNS — every one of these reads as AI-generated and kills cold email. Eliminate all of them:',
    bullets(ANTI_PATTERNS),
    '',
    'HOUSE RULES (still apply):',
    bullets(SHARED_RULES),
    styleBlock,
    personaBlock,
    '',
    'THE EMAIL TO REWRITE',
    `Current subject: ${a.emailSubject}`,
    'Current body:',
    a.emailBody,
    '',
    'YOUR TASK',
    actionInstruction(a.action, a.instruction),
    '',
    'CONSTRAINTS',
    '- Preserve every merge tag exactly as written (single-brace UPPERCASE, e.g. {FIRST_NAME}, {COMPANY}, {MAGNET_LINK}). Do not add, drop, or rename tags.',
    '- Do NOT add a sign-off or signature. The sending inbox injects the signature automatically.',
    '- Do not use em dashes anywhere.',
    '- Return real edited copy, never placeholders or notes inside the email.',
    '',
    'OUTPUT CONTRACT — respond with ONLY a single JSON object, no prose before or after:',
    '{',
    '  "email_subject": "<the subject line, edited or unchanged>",',
    '  "email_body": "<the body with merge tags, no signature>",',
    '  "note": "<one short sentence on what you changed>"',
    '}',
  ]
    .filter((line) => line !== '')
    .join('\n');
}
