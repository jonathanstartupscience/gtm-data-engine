/**
 * Shared HTTP helpers: a sliding-window rate limiter + a retrying fetch wrapper.
 * Port of the ESO run's http_util.py. One place for rate limits + 429/5xx backoff.
 */

/** Sliding-window limiter: at most `n` calls per `windowMs`. Async-safe (single event loop). */
export class RateLimiter {
  private calls: number[] = [];
  constructor(private n: number, private windowMs: number) {}

  async wait(): Promise<void> {
    const now = Date.now();
    while (this.calls.length && now - this.calls[0] >= this.windowMs) this.calls.shift();
    if (this.calls.length >= this.n) {
      const sleep = this.windowMs - (now - this.calls[0]) + 5;
      await new Promise((r) => setTimeout(r, Math.max(sleep, 0)));
      return this.wait();
    }
    this.calls.push(Date.now());
  }
}

export interface RequestOpts extends RequestInit {
  limiter?: RateLimiter;
  timeoutMs?: number;
  retries?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Rate-limited, retrying fetch. Retries on 429/5xx (honoring Retry-After) and network errors,
 * with exponential backoff. Returns the Response; caller inspects status for 4xx.
 */
export async function request(url: string, opts: RequestOpts = {}): Promise<Response> {
  const { limiter, timeoutMs = 30_000, retries = 5, ...init } = opts;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (limiter) await limiter.wait();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if ((resp.status === 429 || resp.status >= 500) && attempt < retries) {
        const ra = Number(resp.headers.get('retry-after'));
        const backoff = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(2 ** attempt * 1000, 60_000);
        attempt++;
        await sleep(backoff);
        continue;
      }
      return resp;
    } catch (err) {
      clearTimeout(timer);
      if (attempt < retries) {
        attempt++;
        await sleep(Math.min(2 ** attempt * 1000, 60_000));
        continue;
      }
      throw err;
    }
  }
}

/** Convenience: request + parse JSON, throwing on non-2xx with a short body snippet. */
export async function requestJson<T = unknown>(url: string, opts: RequestOpts = {}): Promise<T> {
  const resp = await request(url, opts);
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${opts.method ?? 'GET'} ${url}: ${text.slice(0, 300)}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}
