/**
 * Bouncer adapter — email verification (the de-bounce gate). LOCKED provider.
 * Ported from the ESO run's bouncer.py. Base https://api.usebouncer.com · x-api-key.
 */
import { config } from '../../lib/config.js';
import { request, requestJson, RateLimiter } from '../../lib/http.js';

const BASE = 'https://api.usebouncer.com';
const limiter = new RateLimiter(900, 60_000); // 1000/min single endpoint; stay under
const headers = () => ({ 'x-api-key': config.bouncerKey, 'Content-Type': 'application/json' });

export interface BouncerResult {
  email: string;
  status: 'deliverable' | 'risky' | 'undeliverable' | 'unknown';
  reason?: string;
  score?: number;
  domain?: { acceptAll?: string; disposable?: string; free?: string };
  account?: { role?: string };
}

export async function credits(): Promise<number> {
  const j = await requestJson<{ credits: number }>(`${BASE}/v1.1/credits`, { headers: headers(), limiter });
  return j.credits;
}

export async function verifySingle(email: string, timeout = 15): Promise<BouncerResult> {
  const url = `${BASE}/v1.1/email/verify?email=${encodeURIComponent(email)}&timeout=${timeout}`;
  return requestJson(url, { headers: headers(), limiter });
}

async function batchCreate(emails: string[]): Promise<string> {
  const j = await requestJson<{ batchId: string }>(`${BASE}/v1.1/email/verify/batch`, {
    method: 'POST', headers: headers(), limiter,
    body: JSON.stringify(emails.map((e) => ({ email: e }))),
  });
  return j.batchId;
}

async function batchStatus(id: string): Promise<{ status: string; credits?: number; stats?: unknown }> {
  return requestJson(`${BASE}/v1.1/email/verify/batch/${id}?with-stats=true`, { headers: headers(), limiter });
}

async function batchDownload(id: string): Promise<BouncerResult[]> {
  return requestJson(`${BASE}/v1.1/email/verify/batch/${id}/download`, { headers: headers(), limiter });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Full batch lifecycle: submit → poll until completed → download. */
export async function batchVerify(
  emails: string[],
  log: (m: string) => void = console.log,
  pollMs = 15_000,
  maxWaitMs = 2 * 60 * 60_000,
): Promise<BouncerResult[]> {
  if (!emails.length) return [];
  const id = await batchCreate(emails);
  log(`Bouncer batch ${id} submitted: ${emails.length} emails`);
  let waited = 0;
  while (waited < maxWaitMs) {
    const st = await batchStatus(id);
    if (st.status === 'completed') {
      log(`Bouncer batch completed: credits=${st.credits} stats=${JSON.stringify(st.stats)}`);
      return batchDownload(id);
    }
    await sleep(pollMs);
    waited += pollMs;
  }
  throw new Error(`Bouncer batch ${id} did not complete in time`);
}
