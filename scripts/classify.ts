/**
 * Local classification CLI — proposes type/sub_type for companies missing them, using
 * `claude -p` (Claude Code's existing auth → $0, no API key). Writes to the review queue.
 *
 * Usage:
 *   npm run classify -- --limit 50            # homepage-only signal (free)
 *   npm run classify -- --limit 50 --ocean    # allow Ocean fallback when homepage is thin
 *
 * Nothing is applied to the store — review + approve in the app first.
 */
import { spawn } from 'node:child_process';
import { classifyCompanies, type ClassifyOutput } from '../src/engine/stages/classify.js';

// On Windows the npm-installed CLI is claude.cmd; elsewhere it's `claude`.
const CLAUDE_BIN = process.platform === 'win32' ? 'claude.cmd' : 'claude';

/** Run `claude -p` with the prompt piped via stdin (avoids shell-escaping untrusted text). */
function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, ['-p', '--output-format', 'json'], {
      shell: process.platform === 'win32', stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 90_000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error(err.slice(0, 120) || `exit ${code}`)); });
    child.stdin.write(prompt); child.stdin.end();
  });
}

/** The swappable LLM brain: call claude -p and parse the JSON it returns. */
async function claudeClassify(prompt: string): Promise<ClassifyOutput | null> {
  try {
    const stdout = await runClaude(prompt);
    // claude --output-format json wraps the result; the model's text is in .result
    let text = stdout.trim();
    try { const wrap = JSON.parse(text); if (wrap && typeof wrap.result === 'string') text = wrap.result; } catch { /* plain */ }
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]);
    if (!o.type || !o.subType) return null;
    return { type: String(o.type), subType: String(o.subType), confidence: Number(o.confidence) || 0, reason: String(o.reason ?? '') };
  } catch (e) {
    console.error('  claude -p failed:', (e as Error).message.slice(0, 120));
    return null;
  }
}

const args = process.argv.slice(2);
const val = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const limit = val('limit') ? Number(val('limit')) : 25;
const oceanFallback = args.includes('--ocean');

console.log(`Classifying up to ${limit} companies (homepage signal${oceanFallback ? ' + Ocean fallback' : ' only'})…`);
const r = await classifyCompanies(claudeClassify, { limit, oceanFallback }, console.log);
console.log(`\nDone: ${r.proposed} proposals written to the review queue, ${r.errors} errors, ${r.oceanCalls} Ocean fallbacks.`);
console.log('Review + approve them in the app (Classify review).');
process.exit(0);
