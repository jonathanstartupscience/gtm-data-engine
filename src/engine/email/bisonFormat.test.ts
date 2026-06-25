/**
 * Unit tests for the Bison copy formatter — the boundary that turns stored sequence copy into the
 * exact shape the live instance renders. These are PURE (no network): they pin the dialect, spacing,
 * sign-off stripping, idempotency, and tag-fillability rules so a silent copy-mangling regression is
 * caught here, not in a prospect's inbox.
 *
 * Run with:  npx tsx --test src/engine/email/bisonFormat.test.ts   (or `npm test`)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeTags, tagsUsed, unfillableTags, unfillableTagsInSteps,
  toBisonHtml, formatStepForBison, formatStepsForBison,
} from './bisonFormat.js';
import { scheduleFromDays } from '../adapters/emailbison.js';

// ---------------------------------------------------------------- canonicalizeTags
test('maps known {{snake_case}} tags to single-brace UPPERCASE', () => {
  assert.equal(canonicalizeTags('Hi {{first_name}} at {{company}}'), 'Hi {FIRST_NAME} at {COMPANY}');
  assert.equal(canonicalizeTags('{{sender_name}}'), '{SENDER_FULL_NAME}');
  assert.equal(canonicalizeTags('{{title}} / {{last_name}}'), '{TITLE} / {LAST_NAME}');
});

test('uppercases unknown tags rather than dropping them', () => {
  assert.equal(canonicalizeTags('{{weird_field}}'), '{WEIRD_FIELD}');
});

test('tolerates inner whitespace and mixed case', () => {
  assert.equal(canonicalizeTags('{{ First_Name }}'), '{FIRST_NAME}');
});

test('is idempotent — already-canonical tags are untouched', () => {
  const once = canonicalizeTags('Hi {{first_name}}');
  assert.equal(once, 'Hi {FIRST_NAME}');
  assert.equal(canonicalizeTags(once), 'Hi {FIRST_NAME}'); // running again must not change it
});

// ---------------------------------------------------------------- tagsUsed / fillability
test('tagsUsed reports the canonical tags present', () => {
  assert.deepEqual(tagsUsed('{{first_name}} {COMPANY}').sort(), ['COMPANY', 'FIRST_NAME']);
});

test('unfillableTags flags tags the push cannot populate', () => {
  assert.deepEqual(unfillableTags('Hi {FIRST_NAME}, re {{trigger}}'), ['TRIGGER']);
  assert.deepEqual(unfillableTags('{FIRST_NAME} {COMPANY} {PERSONA}'), []); // all fillable
});

test('unfillableTagsInSteps de-dupes across subject + body of all steps', () => {
  const steps = [
    { email_subject: 'About {{trigger}}', email_body: 'Hi {{first_name}}' },
    { email_subject: 'Re: {COMPANY}', email_body: 'Still {TRIGGER}?' },
  ];
  assert.deepEqual(unfillableTagsInSteps(steps), ['TRIGGER']);
});

// ---------------------------------------------------------------- toBisonHtml (spacing!)
test('wraps plain-text beats in <p> and inserts a visible spacer between them', () => {
  const html = toBisonHtml('First beat.\n\nSecond beat.');
  assert.equal(html, '<p>First beat.</p><p><br></p><p>Second beat.</p>');
});

test('a single beat has no trailing spacer', () => {
  assert.equal(toBisonHtml('Just one.'), '<p>Just one.</p>');
});

test('newlines inside one beat become <br>, blank lines separate beats', () => {
  const html = toBisonHtml('Line A\nLine B\n\nNext beat');
  assert.equal(html, '<p>Line A<br>Line B</p><p><br></p><p>Next beat</p>');
});

test('collapses multiple blank lines between beats into one spacer', () => {
  assert.equal(toBisonHtml('A\n\n\n\nB'), '<p>A</p><p><br></p><p>B</p>');
});

test('escapes HTML-significant characters in plain text', () => {
  assert.equal(toBisonHtml('a < b & c > d'), '<p>a &lt; b &amp; c &gt; d</p>');
});

test('already-HTML body is left as paragraphs but gets spacers added', () => {
  const html = toBisonHtml('<p>One</p><p>Two</p>');
  assert.equal(html, '<p>One</p><p><br></p><p>Two</p>');
});

test('already-HTML body that already has a spacer is not double-spaced', () => {
  const input = '<p>One</p><p><br></p><p>Two</p>';
  assert.equal(toBisonHtml(input), input); // idempotent
});

test('empty body yields empty string', () => {
  assert.equal(toBisonHtml('   '), '');
});

// ---------------------------------------------------------------- sign-off stripping
test('strips a trailing sign-off block (closer + name)', () => {
  const html = toBisonHtml('The real CTA line.\n\nBest,\nGreg');
  assert.equal(html, '<p>The real CTA line.</p>'); // sign-off beat removed entirely
});

test('strips a trailing LinkedIn URL line and a sender tag line', () => {
  const html = toBisonHtml('CTA here.\n\n{SENDER_FULL_NAME}\nhttps://linkedin.com/in/greg');
  assert.equal(html, '<p>CTA here.</p>');
});

test('does not strip content that merely contains a name mid-sentence', () => {
  const html = toBisonHtml('Greg built 12 companies.\n\nWorth a look?');
  assert.equal(html, '<p>Greg built 12 companies.</p><p><br></p><p>Worth a look?</p>');
});

// ---------------------------------------------------------------- formatStepForBison
test('formatStepForBison canonicalizes, HTML-ifies, and clamps wait>=1', () => {
  const out = formatStepForBison({ order: 1, wait_in_days: 0, email_subject: 'Hi {{first_name}}', email_body: 'A\n\nB' });
  assert.equal(out.wait_in_days, 1);                 // 0 clamped to 1
  assert.equal(out.email_subject, 'Hi {FIRST_NAME}');
  assert.equal(out.email_body, '<p>A</p><p><br></p><p>B</p>');
  assert.deepEqual(Object.keys(out).sort(), ['email_body', 'email_subject', 'order', 'wait_in_days']); // no variant leaks
});

test('formatStepForBison preserves a real wait value', () => {
  assert.equal(formatStepForBison({ order: 2, wait_in_days: 4, email_subject: 's', email_body: 'b' }).wait_in_days, 4);
});

test('formatStepsForBison sorts by order', () => {
  const out = formatStepsForBison([
    { order: 3, wait_in_days: 2, email_subject: 'c', email_body: 'c' },
    { order: 1, wait_in_days: 0, email_subject: 'a', email_body: 'a' },
    { order: 2, wait_in_days: 1, email_subject: 'b', email_body: 'b' },
  ]);
  assert.deepEqual(out.map((s) => s.order), [1, 2, 3]);
});

// ---------------------------------------------------------------- scheduleFromDays
test('scheduleFromDays sets per-day booleans + H:i window + save_as_template', () => {
  const s = scheduleFromDays({
    timezone: 'America/New_York',
    days: [
      { day: 'monday', from: '08:00:00', to: '17:00:00' },
      { day: 'wednesday', from: '08:00:00', to: '17:00:00' },
    ],
  });
  assert.equal(s.monday, true);
  assert.equal(s.wednesday, true);
  assert.equal(s.tuesday, false);
  assert.equal(s.saturday, false);
  assert.equal(s.start_time, '08:00');   // H:i, NOT H:i:s
  assert.equal(s.end_time, '17:00');
  assert.equal(s.timezone, 'America/New_York');
  assert.equal(s.save_as_template, false);
});

test('scheduleFromDays falls back to a default window when none given', () => {
  const s = scheduleFromDays({ timezone: 'UTC', days: [] });
  assert.equal(s.start_time, '08:00');
  assert.equal(s.end_time, '17:00');
  assert.equal(s.monday, false);
});
