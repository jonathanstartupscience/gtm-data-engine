/**
 * Seed the sequence library by POSTing to the live API (so everything goes through
 * the same validation + persistence path the app uses). Authenticates with the
 * service token, so it works headless (Claude Code, CI) without a Clerk session.
 *
 * Usage:
 *   API_SERVICE_TOKEN=<token> npm run seed:sequences -- --file <path.json> [--api <base-url>]
 *
 *   --file   JSON file: an array of sequence objects (see SeedSequence below).
 *   --api    API base URL (default http://localhost:8080). Use the prod URL to seed prod.
 *   --dry    Print what would be sent, POST nothing.
 *
 * The JSON shape matches the /api/outbound/sequences body, including the optional
 * `meta` block that drives the library inputs summary + filters:
 *   {
 *     "name": "ESO · Pain · Weak outcomes after Demo Day",
 *     "description": "…",
 *     "persona": "ESO Leadership",
 *     "steps": [{ "order": 1, "wait_in_days": 0, "email_subject": "…", "email_body": "…" }],
 *     "meta": { "styleKey": "pain-centric", "personaKey": "eso", "painKey": "…",
 *               "painLabel": "…", "leadMagnetId": null, "senderMode": "edify",
 *               "abVariant": false, "rationale": "…", "genModel": "claude-opus-4-8" }
 *   }
 *
 * Idempotent-ish: by default it skips a sequence whose exact name already exists
 * (so re-running won't duplicate). Pass --replace to delete+recreate same-named ones.
 */

interface SeedStep { order: number; wait_in_days: number; email_subject: string; email_body: string; variant?: string; thread_reply?: boolean }
interface SeedMeta {
  styleKey?: string; personaKey?: string; painKey?: string; painLabel?: string;
  leadMagnetId?: string | null; senderMode?: 'greg' | 'edify'; abVariant?: boolean;
  rationale?: string; genModel?: string;
}
interface SeedSequence { name: string; description?: string; persona?: string; steps: SeedStep[]; meta?: SeedMeta }

function arg(flag: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (flag: string) => process.argv.includes(flag);

async function main() {
  const file = arg('--file');
  const api = (arg('--api', 'http://localhost:8080') as string).replace(/\/$/, '');
  const dry = has('--dry');
  const replace = has('--replace');
  const token = (process.env.API_SERVICE_TOKEN ?? '').trim();

  if (!file) { console.error('Missing --file <path.json>'); process.exit(1); }
  if (!dry && !token) { console.error('Missing API_SERVICE_TOKEN env (needed unless --dry)'); process.exit(1); }

  const { readFileSync } = await import('node:fs');
  let seqs: SeedSequence[];
  try {
    seqs = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(seqs)) throw new Error('file must contain a JSON array');
  } catch (e) { console.error(`Could not read ${file}: ${(e as Error).message}`); process.exit(1); return; }

  const headers = { 'Content-Type': 'application/json', 'X-Service-Token': token };
  console.log(`${dry ? '[dry] ' : ''}Seeding ${seqs.length} sequence(s) → ${api}`);

  // Fetch existing names once (for skip/replace logic).
  let existing = new Map<string, number>();
  if (!dry) {
    const r = await fetch(`${api}/api/outbound/sequences`, { headers });
    if (!r.ok) { console.error(`List failed (${r.status}). Check --api and token.`); process.exit(1); }
    const { sequences } = await r.json() as { sequences: { id: number; name: string }[] };
    existing = new Map(sequences.map((s) => [s.name, s.id]));
  }

  let created = 0, skipped = 0, replaced = 0, failed = 0;
  for (const s of seqs) {
    if (!s.name || !Array.isArray(s.steps) || !s.steps.length) { console.warn(`  ✗ skipping malformed: ${s.name ?? '(no name)'}`); failed++; continue; }
    if (dry) { console.log(`  [dry] would POST "${s.name}" (${s.steps.length} steps)`); continue; }

    const hit = existing.get(s.name);
    if (hit && !replace) { console.log(`  · skip (exists): ${s.name}`); skipped++; continue; }
    if (hit && replace) {
      const d = await fetch(`${api}/api/outbound/sequences/${hit}`, { method: 'DELETE', headers });
      if (d.ok) replaced++;
    }
    const r = await fetch(`${api}/api/outbound/sequences`, { method: 'POST', headers, body: JSON.stringify(s) });
    if (r.ok) { console.log(`  ✓ ${replace && hit ? 'replaced' : 'created'}: ${s.name}`); created++; }
    else { console.error(`  ✗ ${r.status} ${s.name}: ${(await r.text()).slice(0, 160)}`); failed++; }
  }

  console.log(`\nDone. created ${created}${replaced ? `, replaced ${replaced}` : ''}, skipped ${skipped}, failed ${failed}.`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
