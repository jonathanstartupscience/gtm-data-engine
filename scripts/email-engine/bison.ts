/**
 * Thin Bison HTTP client for the custom instance (send.visitstartupscience.com), with the
 * instance-correct shapes AND a conservative throttle. Separate from src/engine/adapters/emailbison.ts
 * on purpose: that adapter's shapes are wrong for this instance and its RateLimiter (500/min) is far
 * too aggressive — bursting trips a per-token abuse guard that returns a MISLEADING 401
 * ("not authenticated") and then blocks the token for a cooldown. Verified safe rate: ~1 write/sec.
 *
 * See HANDOFF-email-engine-fixes.md and memory eso-bison-instance / bison-no-subject-variants.
 */
import { bisonKeyFor, bisonBaseFor } from '../../src/lib/secrets.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface Ctx { base: string; key: string; }

export async function ctxFor(slug: string): Promise<Ctx> {
  // ONE shared Bison host for all workspaces (send.visitstartupscience.com) — bisonBaseFor() resolves
  // it from the in-app "Email Bison instance URL" setting / EMAILBISON_BASE_URL / default. Workspaces
  // are distinguished by API KEY only, never by URL. (workspaces.bisonBaseUrl is legacy/unused — do
  // NOT read it; the per-workspace-base approach was tried and reverted 2026-06-24.)
  const [key, base] = await Promise.all([bisonKeyFor(slug), bisonBaseFor()]);
  if (!key) throw new Error(`No Bison key for workspace "${slug}" (set EMAILBISON_API_KEY__${slug} in env or the app)`);
  return { key, base: base.replace(/\/$/, '') };
}

export function client(ctx: Ctx, opts: { writeDelayMs?: number } = {}) {
  const H = () => ({ Authorization: `Bearer ${ctx.key}`, Accept: 'application/json', 'Content-Type': 'application/json' });
  const writeDelayMs = opts.writeDelayMs ?? 1000; // ~1 write/sec — verified safe on this instance

  async function req(method: string, path: string, body?: unknown) {
    const r = await fetch(`${ctx.base}${path}`, { method, headers: H(), body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, ok: r.ok, text: await r.text() };
  }

  /** Find an existing lead id by exact email (account-global), or null. */
  async function findLeadByEmail(email: string): Promise<number | null> {
    const r = await req('GET', `/leads?search=${encodeURIComponent(email)}`);
    if (!r.ok) return null;
    const d = JSON.parse(r.text).data || [];
    const hit = d.find((l: { email?: string; id?: number }) => (l.email || '').toLowerCase().trim() === email.toLowerCase().trim());
    return hit?.id ?? null;
  }

  /**
   * Ensure a lead exists and return its id — THROTTLED and idempotent. Leads are account-global on
   * this instance and emails are unique: creating a duplicate 422s ("email already taken"). So we
   * search first and reuse the existing id; only create when absent. On a 401 (the instance's
   * disguised throttle/cooldown signal) we back off and retry; if it persists we throw so the caller
   * ABORTS rather than silently failing thousands (the bug that burned the first token).
   */
  async function ensureLeadThrottled(lead: Record<string, unknown> & { email: string }): Promise<number> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await req('POST', '/leads', lead);
      if (r.status === 201) {
        const j = JSON.parse(r.text);
        await sleep(writeDelayMs);
        return (j.id ?? j.data?.id) as number;
      }
      // Already exists → look it up and reuse (idempotent re-runs, cross-campaign overlap).
      if (r.status === 422 && /already been taken/i.test(r.text)) {
        const existing = await findLeadByEmail(lead.email);
        await sleep(writeDelayMs);
        if (existing) return existing;
        throw new Error(`lead ${lead.email} reported taken but not found by search`);
      }
      // 401 here is the throttle/cooldown signal, not a real auth failure (we authenticate fine).
      if (r.status === 401 || r.status === 429) { await sleep(5000 * (attempt + 1)); continue; }
      throw new Error(`createLead ${r.status}: ${r.text.slice(0, 200)}`);
    }
    throw new Error('createLead failed after retries — token likely throttled into cooldown. Aborting.');
  }

  async function attachLeads(campaignId: number, leadIds: number[]) {
    if (!leadIds.length) return;
    for (let i = 0; i < leadIds.length; i += 100) {
      const chunk = leadIds.slice(i, i + 100);
      const r = await req('POST', `/campaigns/${campaignId}/leads/attach-leads`, { lead_ids: chunk });
      if (!r.ok) throw new Error(`attach-leads ${r.status}: ${r.text.slice(0, 200)}`);
      await sleep(writeDelayMs);
    }
  }

  const resumeCampaign = (bisonCampaignId: number) => req('PATCH', `/campaigns/${bisonCampaignId}/resume`);
  const listCampaignLeadEmails = async (bisonCampaignId: number): Promise<Set<string>> => {
    const out = new Set<string>();
    let page = 1;
    for (;;) {
      const r = await req('GET', `/campaigns/${bisonCampaignId}/leads?page=${page}`);
      if (!r.ok) break;
      const j = JSON.parse(r.text);
      const d = j.data || [];
      for (const l of d) if (l.email) out.add(String(l.email).toLowerCase().trim());
      if (!j.meta || j.meta.current_page >= j.meta.last_page || !d.length) break;
      page++;
    }
    return out;
  };
  const listCampaigns = async () => {
    const r = await req('GET', '/campaigns?page=1');
    return r.ok ? (JSON.parse(r.text).data || []) : [];
  };

  return { req, ensureLeadThrottled, findLeadByEmail, attachLeads, resumeCampaign, listCampaignLeadEmails, listCampaigns };
}
