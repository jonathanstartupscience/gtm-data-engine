#!/usr/bin/env node
/**
 * gtm-api.mjs — headless authenticated caller for the GTM Data Engine API.
 *
 * Why this exists: Claude Code / scripts need to hit the real API without the
 * API_SERVICE_TOKEN ever appearing on a command line or in a transcript. This
 * reads the token from `.env` (gitignored) at runtime and sends it as a Bearer
 * header. The token stays in the file; nothing secret is ever passed as an arg.
 *
 * Usage:
 *   node scripts/gtm-api.mjs GET  /api/store/companies?subType=University&limit=5
 *   node scripts/gtm-api.mjs POST /api/discover/find-contacts/scope '{"subType":"University"}'
 *
 * Env:
 *   GTM_API_BASE   override base URL (default https://gtm.startupscience.io)
 *   API_SERVICE_TOKEN  read from process env first, else parsed from ./.env
 *
 * Output: prints the HTTP status to stderr and the response body (pretty JSON
 * when possible) to stdout. Exits non-zero on HTTP >= 400.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

function loadToken() {
  const fromEnv = (process.env.API_SERVICE_TOKEN ?? '').trim();
  if (fromEnv) return fromEnv;
  try {
    const env = readFileSync(resolve(repoRoot, '.env'), 'utf8');
    const m = env.match(/^API_SERVICE_TOKEN=(.*)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '');
  } catch { /* .env optional */ }
  return '';
}

const [, , methodArg, pathArg, bodyArg] = process.argv;
if (!methodArg || !pathArg) {
  console.error('usage: node scripts/gtm-api.mjs <METHOD> <path> [jsonBody]');
  process.exit(2);
}

const method = methodArg.toUpperCase();
const base = (process.env.GTM_API_BASE ?? 'https://gtm.startupscience.io').replace(/\/$/, '');

// Git Bash / MSYS on Windows rewrites a leading "/api/..." arg into a Windows
// path like "/C:/Program Files/Git/api/...". Detect that mangling and recover
// the real path so the call never silently misfires. (Setting MSYS_NO_PATHCONV=1
// in the shell also prevents it, but this makes the script robust either way.)
let p = pathArg;
const mangled = p.match(/^\/?[A-Za-z]:[/\\].*?(\/api\/.*)$/);
if (mangled) p = mangled[1];
const url = p.startsWith('http') ? p : base + (p.startsWith('/') ? p : '/' + p);

const token = loadToken();
if (!token) {
  console.error('No API_SERVICE_TOKEN found (env or .env). Cannot authenticate.');
  process.exit(3);
}

const headers = { Authorization: `Bearer ${token}` };
let body;
if (bodyArg) { headers['content-type'] = 'application/json'; body = bodyArg; }

const res = await fetch(url, { method, headers, body });
const text = await res.text();
console.error(`HTTP ${res.status} ${method} ${url.replace(base, '')}`);
try { console.log(JSON.stringify(JSON.parse(text), null, 2)); }
catch { console.log(text); }
process.exit(res.status >= 400 ? 1 : 0);
