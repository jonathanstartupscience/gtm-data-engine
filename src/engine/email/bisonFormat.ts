/**
 * Bison copy formatter — the single boundary that turns our stored sequence copy into the exact
 * shape this Email Bison instance renders correctly. The ESO build proved our vendor-doc-derived
 * assumptions were wrong; this module is the source of truth instead.
 *
 * It does four things, all idempotent (safe to run on already-formatted copy):
 *   1. MERGE TAGS — map legacy {{snake_case}} tags to the instance dialect: single-brace
 *      UPPERCASE ({FIRST_NAME}, {COMPANY}, {LAST_NAME}, {TITLE}, {SENDER_FULL_NAME}). Copy written
 *      after the dialect standardization already emits these; this catches anything older.
 *   2. HTML — convert plain-text bodies (blank-line-separated beats) to <p>…</p> blocks. A body
 *      that already contains <p> tags is left alone.
 *   3. SPACING — join content paragraphs with an empty <p><br></p> spacer. Without it Bison renders
 *      paragraphs flush against each other with no visible gap (the reviewer caught this immediately).
 *   4. SIGN-OFF — strip any trailing signature/sign-off lines. Bison injects the signature per
 *      sending inbox, so a sign-off in the copy double-signs the email.
 *
 * It also exposes the set of merge tags a piece of copy USES, and which of those the push can
 * actually populate, so callers can warn about a tag that would render blank (e.g. {TRIGGER}).
 */

/** Map of our legacy snake_case merge tags → the instance's single-brace UPPERCASE dialect. */
const TAG_MAP: Record<string, string> = {
  first_name: 'FIRST_NAME',
  last_name: 'LAST_NAME',
  company: 'COMPANY',
  title: 'TITLE',
  sender_name: 'SENDER_FULL_NAME',
  sender_full_name: 'SENDER_FULL_NAME',
  // Tags with no instance equivalent are dropped at the push boundary; they have no populated
  // value here. Listed so canonicalizeTags maps them to a recognizable single-brace form and
  // the unfillable-tag check can flag them.
  sender_linkedin: 'SENDER_LINKEDIN',
  magnet_link: 'MAGNET_LINK',
  trigger: 'TRIGGER',
};

/**
 * The merge tags this push pipeline can actually populate on the lead. Anything a sequence uses
 * that is NOT in this set will render blank in the sent email. Keep in sync with the lead fields
 * + custom variables emitted by the activate stage (toBisonLeads).
 */
export const FILLABLE_TAGS = new Set<string>([
  'FIRST_NAME', 'LAST_NAME', 'COMPANY', 'TITLE', 'SENDER_FULL_NAME',
  'PERSONA', 'SUB_TYPE',
]);

/**
 * Rewrite legacy {{snake_case}} merge tags to the instance's {UPPERCASE} dialect. Idempotent:
 * tags already in {UPPERCASE} form are untouched (we only match the {{double_brace}} pattern).
 */
export function canonicalizeTags(text: string): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, raw: string) => {
    const key = String(raw).toLowerCase();
    const mapped = TAG_MAP[key] ?? key.toUpperCase();
    return `{${mapped}}`;
  });
}

/** Every single-brace merge tag a piece of copy references (after canonicalization). */
export function tagsUsed(text: string): string[] {
  const canon = canonicalizeTags(text);
  const out = new Set<string>();
  for (const m of canon.matchAll(/\{([A-Z0-9_]+)\}/g)) out.add(m[1]);
  return [...out];
}

/** Merge tags a piece of copy uses that the push can't fill (would render blank). */
export function unfillableTags(text: string): string[] {
  return tagsUsed(text).filter((t) => !FILLABLE_TAGS.has(t));
}

/**
 * Heuristic: is this trailing line a sign-off the inbox should inject instead? We strip a short
 * closing run (e.g. "Best,", "Greg", "{SENDER_FULL_NAME}", a LinkedIn URL line) at the very end.
 */
const SIGNOFF_OPENER = /^(best|thanks|thank you|cheers|warmly|regards|sincerely|talk soon|all the best)\b[,.!]?$/i;
const SIGNOFF_TAG_LINE = /\{SENDER_[A-Z_]+\}/;
const URL_ONLY_LINE = /^https?:\/\/\S+$/i;

/** Strip a trailing signature/sign-off block from plain-text body lines (operates on a line array). */
function stripSignoffLines(lines: string[]): string[] {
  const out = [...lines];
  // Walk back from the end, dropping sign-off-ish lines until we hit real content.
  while (out.length) {
    const last = out[out.length - 1].trim();
    if (last === '') { out.pop(); continue; }
    if (SIGNOFF_OPENER.test(last) || SIGNOFF_TAG_LINE.test(last) || URL_ONLY_LINE.test(last)) {
      out.pop();
      continue;
    }
    break;
  }
  return out;
}

/**
 * Convert a plain-text body (beats separated by blank lines) into Bison HTML: each beat becomes a
 * <p>…</p>, joined by an empty <p><br></p> spacer so paragraphs render with a visible gap. Newlines
 * inside a single beat become <br>. If the body already contains <p> tags we assume it's HTML and
 * only ensure the spacers are present between adjacent </p><p>.
 */
export function toBisonHtml(plain: string): string {
  const text = plain.trim();
  if (!text) return '';

  // Already HTML — just ensure visible spacers between adjacent paragraphs.
  if (/<p[ >]/i.test(text)) {
    return text.replace(/<\/p>\s*<p(?![^>]*>\s*<br)/gi, '</p><p><br></p><p');
  }

  const beats = text
    .split(/\n\s*\n+/)            // blank line(s) separate beats
    .map((b) => stripSignoffLines(b.split('\n')).join('\n').trim())
    .filter((b) => b.length > 0)
    .map((b) => `<p>${escapeHtml(b).replace(/\n/g, '<br>')}</p>`);

  return beats.join('<p><br></p>');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface FormattedStep {
  order: number;
  wait_in_days: number;
  email_subject: string;
  email_body: string;
}

export interface RawStep {
  order: number;
  wait_in_days: number;
  email_subject: string;
  email_body: string;
  variant?: string;
  thread_reply?: boolean;
}

/**
 * Format one stored step for THIS Bison instance: canonicalize tags in subject + body, convert the
 * body to spaced HTML (sign-off stripped), and clamp wait_in_days to ≥1 (the instance rejects 0,
 * which our step-1 templates use). Returns the minimal shape setSequenceSteps sends.
 */
export function formatStepForBison(step: RawStep): FormattedStep {
  const subject = canonicalizeTags(step.email_subject);
  const body = toBisonHtml(canonicalizeTags(step.email_body));
  return {
    order: step.order,
    wait_in_days: Math.max(1, Math.floor(step.wait_in_days || 0)),
    email_subject: subject,
    email_body: body,
  };
}

/** Format a whole sequence for Bison (sorted by order). */
export function formatStepsForBison(steps: RawStep[]): FormattedStep[] {
  return [...steps].sort((a, b) => a.order - b.order).map(formatStepForBison);
}

/** All unfillable tags across a sequence's steps (subject + body), de-duped — for a pre-push warning. */
export function unfillableTagsInSteps(steps: { email_subject: string; email_body: string }[]): string[] {
  const out = new Set<string>();
  for (const s of steps) {
    for (const t of unfillableTags(s.email_subject)) out.add(t);
    for (const t of unfillableTags(s.email_body)) out.add(t);
  }
  return [...out];
}
