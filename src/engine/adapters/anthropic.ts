/**
 * Anthropic API adapter — the in-app classifier brain (alternative to the local `claude -p` CLI).
 * Key resolves DB-first (in-app Settings) then env (ANTHROPIC_API_KEY), so it can be added without
 * a redeploy. Used by the Classify "Run classifier" button.
 */
import { request } from '../../lib/http.js';
import { getSecret, getSecretSync } from '../../lib/secrets.js';
import { RateLimiter } from '../../lib/http.js';
import type { ClassifyOutput } from '../stages/classify.js';

const API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001'; // cheap + fast for structured classification
/** Strongest model — used for quality-critical, low-volume copy generation (cold email sequences). */
export const MODEL_OPUS = 'claude-opus-4-8';
const limiter = new RateLimiter(45, 60_000);

export function isConfigured(): boolean { return !!getSecretSync('ANTHROPIC_API_KEY'); }
export async function isConfiguredAsync(): Promise<boolean> { return !!(await getSecret('ANTHROPIC_API_KEY')); }

/** classifyFn for classifyCompanies(): send the prompt to Claude, parse the JSON it returns. */
export async function anthropicClassify(prompt: string): Promise<ClassifyOutput | null> {
  const key = await getSecret('ANTHROPIC_API_KEY');
  if (!key) return null;
  const resp = await request(API, {
    method: 'POST', limiter,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL, max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!resp.ok) return null;
  const j = (await resp.json()) as { content?: { type: string; text?: string }[] };
  const text = j.content?.map((c) => c.text ?? '').join('') ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    if (!o.type || !o.subType) return null;
    return { type: String(o.type), subType: String(o.subType), confidence: Number(o.confidence) || 0, reason: String(o.reason ?? '') };
  } catch { return null; }
}

/**
 * General-purpose completion — returns the model's raw text. Used for copy generation
 * (cold email sequences) where we want a strong model and structured JSON back.
 * Throws on a missing key or a non-OK response so callers can surface a clear error.
 */
export async function anthropicComplete(opts: {
  prompt: string;
  model?: string;
  maxTokens?: number;
  system?: string;
}): Promise<string> {
  const key = await getSecret('ANTHROPIC_API_KEY');
  if (!key) throw new Error('Anthropic API key not configured — add it under Settings.');
  const resp = await request(API, {
    method: 'POST', limiter,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model ?? MODEL_OPUS,
      max_tokens: opts.maxTokens ?? 4000,
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: 'user', content: opts.prompt }],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Anthropic request failed (${resp.status})${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
  const j = (await resp.json()) as { content?: { type: string; text?: string }[] };
  return j.content?.map((c) => c.text ?? '').join('') ?? '';
}

/** Extract the first balanced top-level JSON object from model text. */
export function extractJson<T = unknown>(text: string): T | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) as T; } catch { return null; }
      }
    }
  }
  return null;
}
