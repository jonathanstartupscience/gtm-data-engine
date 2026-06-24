#!/usr/bin/env node
// PostToolUse(Write|Edit) hook: detect a cold-email sequence seed file and remind the model that
// the cold-email-review skill must PASS the sequence before seeding it.
//
// A seed file is any .json the model just wrote whose content carries the sequence-step shape
// (both an "email_subject" and an "email_body" field). That matches a single POST /sequences body
// AND the array the seeder consumes (npm run seed:sequences). Non-JSON files, and JSON without
// those fields, are ignored, so this stays silent for ordinary edits.
//
// Reads the PostToolUse JSON on stdin, emits hookSpecificOutput.additionalContext on a match.
// Written in Node (always present in this repo) rather than jq, which is not on PATH here.
// Never blocks a write; any internal error exits 0 silently.

import { readFileSync } from 'node:fs';

function main() {
  let raw = '';
  try {
    raw = readFileSync(0, 'utf8'); // fd 0 = stdin
  } catch {
    return; // no stdin, nothing to do
  }

  let evt;
  try {
    evt = JSON.parse(raw);
  } catch {
    return;
  }

  const filePath =
    evt?.tool_input?.file_path || evt?.tool_response?.filePath || '';
  if (!filePath || !filePath.toLowerCase().endsWith('.json')) return;

  // Prefer the content the tool just wrote; fall back to the file on disk.
  let content = evt?.tool_input?.content || '';
  if (!content) {
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      return;
    }
  }
  if (!content) return;

  // The sequence-step fingerprint: both fields must appear.
  if (!content.includes('email_subject') || !content.includes('email_body')) return;

  const msg =
    `A cold-email sequence seed file (${filePath}) was just written. Before running ` +
    `"npm run seed:sequences" or POSTing to /api/outbound/sequences, every sequence in it MUST ` +
    `pass the cold-email-review skill (verdict PASS). Run cold-email-review on each sequence now; ` +
    `if it returns REVISE or REJECT, apply the corrections and re-review until PASS. Do not seed a ` +
    `sequence the reviewer flagged unless the user explicitly overrides after seeing the findings.`;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: msg,
      },
    }),
  );
}

try {
  main();
} catch {
  // Never let a hook error disrupt a write.
}
process.exit(0);
