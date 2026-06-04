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
