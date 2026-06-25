/**
 * Sequence-template → Bison-step transform.
 *
 * Our stored sequence templates are plain text with {{double_brace}} merge tags and (sometimes) a
 * trailing sender sign-off. The custom Bison instance (send.visitstartupscience.com) wants a
 * different dialect. This module is the single place that bridges the two. It is deliberately a
 * thin, pure transform so the app can later absorb it (see HANDOFF-email-engine-fixes.md #2/#3).
 *
 * What it does:
 *   - merge tags: {{first_name}}->{FIRST_NAME}, {{last_name}}->{LAST_NAME}, {{company}}->{COMPANY},
 *                 {{title}}/{{job_title}}->{TITLE}
 *   - sender sign-off lines ({{sender_*}}) are stripped — Bison injects the signature per inbox
 *   - body: plain text (\n\n paragraphs) -> HTML, with an empty <p><br></p> spacer between
 *     paragraphs (this instance shows NO gap between adjacent <p> tags, so the spacer is what
 *     makes the email skimmable)
 *   - wait_in_days clamped to >= 1 (the instance rejects 0)
 *
 * NOTE on merge-tag coverage: only tags this push can populate should survive. {{trigger}} and any
 * other tag with no per-contact value will render blank — exclude such sequences or supply the
 * value before using them (HANDOFF #7).
 */

export interface StoredStep {
  order: number;
  wait_in_days: number;
  email_subject: string;
  email_body: string;
}

export interface BisonStep {
  order: number;
  wait_in_days: number;
  email_subject: string;
  email_body: string;
}

export function tagMap(text: string): string {
  return text
    .replace(/\{\{\s*first_name\s*\}\}/gi, '{FIRST_NAME}')
    .replace(/\{\{\s*last_name\s*\}\}/gi, '{LAST_NAME}')
    .replace(/\{\{\s*company\s*\}\}/gi, '{COMPANY}')
    .replace(/\{\{\s*title\s*\}\}/gi, '{TITLE}')
    .replace(/\{\{\s*job_title\s*\}\}/gi, '{TITLE}');
}

/** Drop trailing sender sign-off lines ({{sender_*}}) and collapse the blank lines they leave. */
export function stripSignoff(body: string): string {
  const lines = body.split('\n');
  const kept = lines.filter((l) => !/^\s*\{\{\s*sender_[a-z_]+\s*\}\}\s*$/i.test(l));
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
}

/** Plain text (\n\n paragraphs) -> HTML with empty <p><br></p> spacers between paragraphs. */
export function toHtml(body: string): string {
  const paras = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return paras.map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('<p><br></p>');
}

/** Detect merge tags the push can't fill (anything still in {{...}} after tagMap, e.g. {{trigger}}). */
export function unsupportedTags(step: StoredStep): string[] {
  const leftover = `${tagMap(step.email_subject)} ${tagMap(step.email_body)}`.match(/\{\{[^}]+\}\}/g) || [];
  return [...new Set(leftover)];
}

/** Full step transform: stored step -> Bison sequence_step. */
export function toBisonStep(s: StoredStep): BisonStep {
  return {
    order: s.order,
    wait_in_days: Math.max(1, s.wait_in_days || (s.order === 1 ? 0 : 1)),
    email_subject: tagMap(s.email_subject),
    email_body: toHtml(tagMap(stripSignoff(s.email_body))),
  };
}
