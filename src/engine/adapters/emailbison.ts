/**
 * Email Bison adapter — cold-email activation. Verified against docs (see VENDOR_API_REFERENCE).
 *
 * WORKSPACE-ROUTED. Email Bison is one account with many workspaces, each with its OWN API key.
 * So every call is bound to a `BisonCtx` (base URL + key) via the `bisonClient(ctx)` factory:
 *
 *     const bison = await bisonClientFor(workspaceId);   // resolves the workspace's key/base
 *     await bison.listCampaigns();
 *
 * Adding a lead to a campaign is TWO steps: create lead → attach by id.
 */
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { workspaces } from '../../db/schema.js';
import { bisonKeyFor, bisonBaseFor } from '../../lib/secrets.js';
import { request, requestJson, RateLimiter } from '../../lib/http.js';

const limiter = new RateLimiter(500, 60_000); // conservative; docs imply ~10/s

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

/**
 * Convert the legacy `{timezone, days:[{day,from,to}]}` schedule (what the API/UI still build) into
 * the instance shape: per-day booleans + a single H:i window + save_as_template. Times are coerced
 * to H:i (the instance rejects H:i:s). The window is taken from the first day with a from/to (the
 * instance applies one window to all enabled days).
 */
export function scheduleFromDays(s: { timezone: string; days: { day: string; from: string; to: string }[] }): BisonSchedule {
  const hi = (t?: string) => (t ?? '').slice(0, 5); // 'HH:MM:SS' | 'HH:MM' → 'HH:MM'
  const enabled = new Set(s.days.map((d) => d.day.toLowerCase()));
  const first = s.days[0];
  const out: BisonSchedule = {
    start_time: hi(first?.from) || '08:00',
    end_time: hi(first?.to) || '17:00',
    timezone: s.timezone,
    save_as_template: false,
  };
  for (const k of DAY_KEYS) out[k] = enabled.has(k);
  return out;
}

/** Per-workspace Bison connection: a base URL + an API key. */
export interface BisonCtx { base: string; key: string; }

/**
 * Resolve a workspace's Bison ctx: its OWN key + the ONE shared base URL. The base is account-wide
 * (the whole Email Bison account lives on one host); a workspace is distinguished by its API key,
 * not its URL — so there is no per-workspace base override. No global key either: an unconfigured
 * workspace gets an empty key and can't send.
 */
export async function ctxForWorkspace(workspaceId?: number | null): Promise<BisonCtx> {
  let slug: string | undefined;
  if (workspaceId) {
    const [w] = await db.select({ slug: workspaces.slug }).from(workspaces).where(eq(workspaces.id, workspaceId));
    slug = w?.slug;
  }
  const [key, base] = await Promise.all([bisonKeyFor(slug), bisonBaseFor()]);
  return { key, base: base.replace(/\/$/, '') };
}

export interface BisonCampaign { id: number; name: string; status?: string }
/**
 * Sending schedule in the shape THIS instance accepts (verified live): per-day booleans + H:i
 * (NOT H:i:s) start/end times + a required `save_as_template`. The older `{timezone, days:[…]}`
 * shape 422'd on the live instance — see scheduleCampaign / scheduleFromDays.
 */
export interface BisonSchedule {
  monday?: boolean; tuesday?: boolean; wednesday?: boolean; thursday?: boolean;
  friday?: boolean; saturday?: boolean; sunday?: boolean;
  start_time: string;  // 'H:i', e.g. '08:00'
  end_time: string;    // 'H:i', e.g. '17:00'
  timezone: string;
  save_as_template?: boolean;
}
/** Legacy per-day window shape some callers still send; scheduleFromDays converts it. */
export interface BisonScheduleDay { day: string; from: string; to: string }
export interface BisonSequenceStep {
  email_subject: string; email_body: string; wait_in_days: number; order: number;
  thread_reply?: boolean;
  /**
   * DEAD for this Bison flavor. The instance exposes no in-step variant mechanism: a second step at
   * the same `order` 422s ("duplicate order"), and `variant`/`variant_from_step` flags are ignored
   * (they silently create a normal follow-up step). To A/B test subjects, run two SEQUENCES as
   * separate experiment arms instead — never in-step variants. Kept only so stored copy round-trips.
   */
  variant?: string;
}
export interface BisonSender { id: number; email: string; name?: string; daily_limit?: number }
export interface BisonStats {
  sent?: number; opens?: number; replies?: number; bounces?: number;
  interested?: number; unsubscribed?: number; [k: string]: unknown;
}
export interface BisonReply {
  id?: number | string;
  campaign_id?: number;
  lead?: { email?: string; first_name?: string; last_name?: string };
  email?: string; first_name?: string; last_name?: string;
  subject?: string; body?: string; message?: string; text?: string;
  sentiment?: string; interested?: boolean; is_interested?: boolean;
  created_at?: string; received_at?: string;
  [k: string]: unknown;
}
export interface BisonLead {
  email: string; first_name?: string; last_name?: string;
  title?: string; company?: string; custom_variables?: { name: string; value: string }[];
}
export interface BisonPushResult { created: number; attached: number; failed: number }
/** Outbound reply payload — Bison sends it from a chosen sender inbox, threaded on the original. */
export interface BisonReplyOut {
  message: string;                 // the reply body
  sender_email_id: number;         // which sender inbox the reply is sent from
  to_emails: { name?: string; email_address: string }[];
  cc_emails?: { name?: string; email_address: string }[];
  bcc_emails?: { name?: string; email_address: string }[];
  content_type?: 'html' | 'text';
  inject_previous_email_body?: boolean;
}

/**
 * Build a Bison client bound to one workspace's ctx. All calls go to that workspace's base/key.
 * Prefer `bisonClientFor(workspaceId)` which resolves the ctx for you.
 */
export function bisonClient(ctx: BisonCtx) {
  const BASE = ctx.base;
  const headers = () => ({ Authorization: `Bearer ${ctx.key}`, 'Content-Type': 'application/json' });

  /**
   * List ALL campaigns in this workspace, following Laravel pagination. Tolerant of response-shape
   * variation across Bison instances (`data` | `items` | bare array) and surfaces the real Bison
   * status/body on failure instead of letting a generic 500 bubble up. Page-capped as a backstop.
   */
  async function listCampaigns(maxPages = 100): Promise<BisonCampaign[]> {
    const all: BisonCampaign[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const resp = await request(`${BASE}/campaigns?page=${page}`, { headers: headers(), limiter });
      if (!resp.ok) {
        const body = (await resp.text()).slice(0, 300);
        throw new Error(`Bison GET /campaigns?page=${page} → ${resp.status}: ${body}`);
      }
      const j = (await resp.json()) as
        | { data?: BisonCampaign[]; items?: BisonCampaign[]; meta?: { current_page?: number; last_page?: number } }
        | BisonCampaign[];
      const rows = Array.isArray(j) ? j : (j.data ?? j.items ?? []);
      all.push(...rows);
      const meta = Array.isArray(j) ? undefined : j.meta;
      if (rows.length === 0) break;                                  // ran past the end
      if (meta?.last_page != null && page >= meta.last_page) break;  // Laravel meta says done
      if (!meta) break;                                              // no pagination meta → single page
    }
    return all;
  }

  /** Fetch a single campaign (full detail). */
  async function getCampaign(id: number): Promise<Record<string, unknown> | null> {
    const resp = await request(`${BASE}/campaigns/${id}`, { headers: headers(), limiter });
    if (!resp.ok) return null;
    const j = (await resp.json()) as { data?: Record<string, unknown> };
    return j.data ?? (j as Record<string, unknown>);
  }

  /** Create a campaign (name only — sequence/schedule/senders configured separately). */
  async function createCampaign(name: string): Promise<{ id: number } | null> {
    const resp = await request(`${BASE}/campaigns`, {
      method: 'POST', headers: headers(), limiter, body: JSON.stringify({ name }),
    });
    if (!resp.ok) return null;
    const j = (await resp.json()) as { id?: number; data?: { id?: number } };
    const id = j.id ?? j.data?.id;
    return id ? { id } : null;
  }

  /** Update campaign limits / tracking settings. */
  function updateCampaign(id: number, patch: Record<string, unknown>): Promise<Response> {
    return request(`${BASE}/campaigns/${id}/update`, {
      method: 'PATCH', headers: headers(), limiter, body: JSON.stringify(patch),
    });
  }

  /**
   * Delete a campaign in Bison (async on the instance). This is the ONLY way to remove sequence
   * steps, since the sequence-steps endpoint append-only with no per-step delete — "editing" a
   * sequence is modeled as delete + recreate.
   */
  function deleteCampaign(id: number): Promise<Response> {
    return request(`${BASE}/campaigns/${id}`, { method: 'DELETE', headers: headers(), limiter });
  }

  /**
   * Set a campaign's sending schedule. The instance wants per-day booleans + H:i start/end + a
   * required `save_as_template` (the older `{timezone, days:[{day,from,to}]}` shape 422s). Callers
   * may pass EITHER shape — a legacy day-window object is converted first.
   */
  function scheduleCampaign(id: number, schedule: BisonSchedule | { timezone: string; days: BisonScheduleDay[] }): Promise<Response> {
    const body = 'days' in schedule ? scheduleFromDays(schedule) : { save_as_template: false, ...schedule };
    return request(`${BASE}/campaigns/${id}/schedule`, {
      method: 'POST', headers: headers(), limiter, body: JSON.stringify(body),
    });
  }

  /**
   * Define the sequence steps for a campaign. The instance wants `{ title, sequence_steps:[…] }`
   * with each step `{ order, wait_in_days, email_subject, email_body }` and `wait_in_days >= 1`.
   *
   * ⚠️ This endpoint APPENDS — re-posting duplicates steps, and there is no per-step DELETE (only
   * `DELETE /campaigns/:id`). So it is only safe to call ONCE per campaign, on a freshly-created
   * campaign with no steps. To "edit" a sequence, delete+recreate the campaign. `title` defaults to
   * the campaign name when omitted.
   */
  function setSequenceSteps(id: number, steps: BisonSequenceStep[], title = 'Sequence'): Promise<Response> {
    const sequence_steps = steps.map((s) => ({
      order: s.order,
      wait_in_days: Math.max(1, Math.floor(s.wait_in_days || 0)), // instance rejects 0
      email_subject: s.email_subject,
      email_body: s.email_body,
    }));
    return request(`${BASE}/campaigns/${id}/sequence-steps`, {
      method: 'POST', headers: headers(), limiter, body: JSON.stringify({ title, sequence_steps }),
    });
  }

  /**
   * List sender inboxes available in this workspace. Surfaces auth failures (401/403) as a thrown
   * error — a wrong key/base must NOT look like "no senders configured" (that bug wasted hours in
   * the ESO build). A genuine empty list still returns []. */
  async function listSenders(): Promise<BisonSender[]> {
    const resp = await request(`${BASE}/sender-emails`, { headers: headers(), limiter });
    if (resp.status === 401 || resp.status === 403) {
      const body = (await resp.text()).slice(0, 200);
      throw new Error(`Bison GET /sender-emails → ${resp.status} (bad key or wrong instance URL): ${body}`);
    }
    if (!resp.ok) return [];
    const j = (await resp.json()) as { data?: BisonSender[] };
    return j.data ?? [];
  }

  /** Attach sender inboxes to a campaign. */
  function attachSenders(id: number, senderEmailIds: number[]): Promise<Response> {
    return request(`${BASE}/campaigns/${id}/attach-sender-emails`, {
      method: 'POST', headers: headers(), limiter, body: JSON.stringify({ sender_email_ids: senderEmailIds }),
    });
  }

  /** Pause / resume a campaign (resume == launch a configured campaign). */
  function pauseCampaign(id: number): Promise<Response> {
    return request(`${BASE}/campaigns/${id}/pause`, { method: 'PATCH', headers: headers(), limiter });
  }
  function resumeCampaign(id: number): Promise<Response> {
    return request(`${BASE}/campaigns/${id}/resume`, { method: 'PATCH', headers: headers(), limiter });
  }

  /** Fetch a campaign's aggregate stats (sent/opens/replies/bounces…). */
  async function getCampaignStats(id: number): Promise<BisonStats | null> {
    const resp = await request(`${BASE}/campaigns/${id}/stats`, { headers: headers(), limiter });
    if (!resp.ok) return null;
    const j = (await resp.json()) as { data?: BisonStats };
    return j.data ?? (j as BisonStats);
  }

  /** TEMP DIAGNOSTIC — probe where stats actually live on this Bison instance. Remove after use. */
  async function statsProbe(id: number): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    // 1) the raw single-campaign object — does it carry stat fields inline?
    try {
      const r = await request(`${BASE}/campaigns/${id}`, { headers: headers(), limiter });
      out.campaign_status = r.status;
      out.campaign_body = (await r.text()).slice(0, 2000);
    } catch (e) { out.campaign_err = String(e); }
    // 2) the /stats endpoint we currently rely on
    try {
      const r = await request(`${BASE}/campaigns/${id}/stats`, { headers: headers(), limiter });
      out.stats_status = r.status;
      out.stats_body = (await r.text()).slice(0, 1000);
    } catch (e) { out.stats_err = String(e); }
    // 3) a couple of plausible alternates
    for (const path of [`/campaigns/${id}/statistics`, `/campaigns/${id}/analytics`, `/campaigns/${id}/report`]) {
      try {
        const r = await request(`${BASE}${path}`, { headers: headers(), limiter });
        out[`alt_${path}`] = `${r.status}: ${(await r.text()).slice(0, 400)}`;
      } catch (e) { out[`alt_${path}`] = String(e); }
    }
    return out;
  }

  /** Send a test email of the sequence to an address (sanity check before launch). */
  function sendTest(id: number, email: string): Promise<Response> {
    return request(`${BASE}/campaigns/${id}/send-test`, {
      method: 'POST', headers: headers(), limiter, body: JSON.stringify({ email }),
    });
  }

  // Candidate reply endpoints (Bison's exact path varies by instance). The first that responds wins.
  const REPLY_PATHS = ['/replies', '/unibox', '/inbox'];

  /**
   * Fetch ONE page of replies, discovering which endpoint this instance uses. Returns the rows plus
   * the resolved base path and pagination meta so a caller can page through. Returns null path if no
   * endpoint responds (so the UI degrades gracefully rather than erroring).
   */
  async function repliesPage(page: number): Promise<{ rows: BisonReply[]; path: string | null; lastPage: number | null }> {
    for (const path of REPLY_PATHS) {
      const resp = await request(`${BASE}${path}?page=${page}`, { headers: headers(), limiter });
      if (resp.ok) {
        const j = (await resp.json()) as { data?: BisonReply[]; items?: BisonReply[]; meta?: { current_page?: number; last_page?: number } };
        const rows = j.data ?? j.items ?? [];
        return { rows, path, lastPage: j.meta?.last_page ?? null };
      }
      if (resp.status !== 404) break; // non-404 = endpoint exists but failed (e.g. auth) — don't try alternates
    }
    return { rows: [], path: null, lastPage: null };
  }

  /**
   * List recent replies (single page) — used by the webhook/quick-check path.
   * For a full retroactive backfill use `listAllReplies()`.
   */
  async function listReplies(page = 1): Promise<BisonReply[]> {
    return (await repliesPage(page)).rows;
  }

  /**
   * Pull the FULL reply history by paging through Bison's reply endpoint (Laravel-style meta when
   * present; otherwise page until an empty page). Caller dedups by reply id on insert, so paging
   * the whole history is safe to re-run. `maxPages` is a safety cap against a misbehaving instance.
   */
  async function listAllReplies(maxPages = 100): Promise<BisonReply[]> {
    const all: BisonReply[] = [];
    let resolvedPath: string | null = null;
    for (let page = 1; page <= maxPages; page++) {
      const { rows, path, lastPage } = await repliesPage(page);
      if (page === 1) resolvedPath = path;
      if (!path) break;                       // no working endpoint — give up gracefully
      all.push(...rows);
      if (rows.length === 0) break;           // ran past the end
      if (lastPage != null && page >= lastPage) break; // Laravel meta says we're done
      void resolvedPath;
    }
    return all;
  }

  /** Mark a lead/reply as interested in Bison (best-effort; path unverified). */
  function markInterested(leadEmail: string, campaignId?: number): Promise<Response> {
    return request(`${BASE}/leads/mark-interested`, {
      method: 'POST', headers: headers(), limiter,
      body: JSON.stringify({ email: leadEmail, campaign_id: campaignId }),
    });
  }

  /**
   * Reply to a lead's message inside Bison's master inbox (threaded under the parent reply).
   * This is how a rep responds WITHOUT owning the rotating sender mailbox — Bison sends it from
   * `sender_email_id`, keeping the conversation on the original thread. `replyId` is Bison's reply_id.
   */
  function sendReply(replyId: string | number, body: BisonReplyOut): Promise<Response> {
    return request(`${BASE}/replies/${replyId}/reply`, {
      method: 'POST', headers: headers(), limiter, body: JSON.stringify(body),
    });
  }

  /** Register a webhook so Bison pushes reply/bounce/etc. events to our receiver. */
  function createWebhook(url: string, eventTypes: string[]): Promise<Response> {
    return request(`${BASE}/webhooks`, {
      method: 'POST', headers: headers(), limiter,
      body: JSON.stringify({ url, event_types: eventTypes }),
    });
  }

  // Custom variables this client has ensured this process-run, so we POST /custom-variables once.
  const ensuredVars = new Set<string>();

  /**
   * Ensure each named custom variable exists in this workspace before a lead references it.
   * `createLead` 422s if `custom_variables:[{name:'persona',…}]` names a variable that doesn't
   * exist yet, so we create them first (idempotent — a duplicate-name POST is tolerated as already
   * existing). Caches per process-run to avoid re-POSTing on every lead.
   */
  async function ensureCustomVariables(names: string[]): Promise<void> {
    for (const name of names) {
      if (!name || ensuredVars.has(name)) continue;
      const resp = await request(`${BASE}/custom-variables`, {
        method: 'POST', headers: headers(), limiter, body: JSON.stringify({ name }),
      });
      // 200/201 = created; 422/409 = already exists. Either way it's now present.
      ensuredVars.add(name);
      if (!resp.ok && resp.status !== 422 && resp.status !== 409) {
        const body = (await resp.text()).slice(0, 200);
        throw new Error(`Bison POST /custom-variables {${name}} → ${resp.status}: ${body}`);
      }
    }
  }

  /** Create a lead; returns its id, or a failure with the Bison status + body so the caller can
   *  surface WHY (not just "failed"). Response shape varies — pull id defensively. */
  async function createLeadDetailed(lead: BisonLead): Promise<{ id: number | null; status: number; error?: string }> {
    // The instance rejects a lead referencing a custom variable that doesn't exist yet — create
    // any referenced vars first (cached, so this is effectively free after the first lead).
    const varNames = (lead.custom_variables ?? []).map((v) => v.name).filter(Boolean);
    if (varNames.length) await ensureCustomVariables(varNames);
    const resp = await request(`${BASE}/leads`, {
      method: 'POST', headers: headers(), limiter, body: JSON.stringify(lead),
    });
    if (!resp.ok) return { id: null, status: resp.status, error: (await resp.text()).slice(0, 200) };
    const j = (await resp.json()) as { id?: number; data?: { id?: number } };
    return { id: j.id ?? j.data?.id ?? null, status: resp.status };
  }

  /** Create a lead; returns its id or null. (Thin wrapper for callers that don't need the reason.) */
  async function createLead(lead: BisonLead): Promise<number | null> {
    return (await createLeadDetailed(lead)).id;
  }

  /** Remove a lead. The `/campaigns/:id/leads/detach-leads` path is 404 on this instance — delete the lead. */
  function detachLead(leadId: number): Promise<Response> {
    return request(`${BASE}/leads/${leadId}`, { method: 'DELETE', headers: headers(), limiter });
  }

  /**
   * List a campaign's leads (email + sequence status), paging through Laravel-style pagination.
   * Used to build a cross-campaign suppression set so a push never double-emails someone already
   * in another active campaign. Tolerant of response-shape variation; page-capped as a backstop.
   */
  async function listCampaignLeads(campaignId: number, maxPages = 200): Promise<{ email: string; status: string | null }[]> {
    const out: { email: string; status: string | null }[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const resp = await request(`${BASE}/campaigns/${campaignId}/leads?page=${page}`, { headers: headers(), limiter });
      if (!resp.ok) break;  // a campaign with no lead list just yields nothing — don't fail the push
      const j = (await resp.json()) as { data?: Record<string, unknown>[]; items?: Record<string, unknown>[]; meta?: { last_page?: number } } | Record<string, unknown>[];
      const rows = Array.isArray(j) ? j : (j.data ?? j.items ?? []);
      for (const r of rows) {
        const lead = (r.lead as Record<string, unknown> | undefined) ?? r;
        const email = String((lead.email as string) ?? (r.email as string) ?? '').toLowerCase().trim();
        if (email) out.push({ email, status: (r.status as string) ?? (r.sequence_status as string) ?? null });
      }
      const meta = Array.isArray(j) ? undefined : j.meta;
      if (rows.length === 0) break;
      if (meta?.last_page != null && page >= meta.last_page) break;
      if (!meta) break;
    }
    return out;
  }

  /** Attach lead ids to a campaign. */
  async function attachLeads(campaignId: number, leadIds: number[]): Promise<void> {
    if (!leadIds.length) return;
    await requestJson(`${BASE}/campaigns/${campaignId}/leads/attach-leads`, {
      method: 'POST', headers: headers(), limiter, body: JSON.stringify({ lead_ids: leadIds }),
    });
  }

  /**
   * Push contacts into a campaign: create each lead, then attach the batch. Surfaces WHY creates
   * fail (the first failure's status + body) instead of a bare count, and FAILS FAST: if the first
   * 10 creates all fail with the same status, it aborts rather than grinding through thousands of
   * doomed calls — almost always a shape/auth problem the same for every lead. (`failFast` off
   * processes the whole list regardless, for callers that want partial progress.)
   */
  async function pushLeadsToCampaign(
    campaignId: number,
    leads: BisonLead[],
    log: (m: string) => void = console.log,
    failFast = true,
  ): Promise<BisonPushResult> {
    let created = 0, failed = 0;
    let firstError: string | undefined;
    const ids: number[] = [];
    for (let i = 0; i < leads.length; i++) {
      const r = await createLeadDetailed(leads[i]);
      if (r.id) { ids.push(r.id); created++; }
      else {
        failed++;
        if (!firstError) { firstError = `lead create → ${r.status}${r.error ? `: ${r.error}` : ''}`; log(`  first lead failure: ${firstError}`); }
        // Early-abort a systemic failure: first 10 all failed → the rest will too.
        if (failFast && created === 0 && failed >= 10) {
          log(`  aborting after ${failed} consecutive failures — likely a payload/auth problem, not bad data.`);
          throw new Error(`Bison lead push failing systemically (${firstError}). Aborted before sending the rest.`);
        }
      }
      if ((i + 1) % 50 === 0) log(`  created ${i + 1}/${leads.length} leads…`);
    }
    // attach in chunks of 100
    let attached = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      await attachLeads(campaignId, chunk);
      attached += chunk.length;
    }
    if (failed) log(`  ${failed}/${leads.length} lead(s) failed${firstError ? ` (first: ${firstError})` : ''}.`);
    return { created, attached, failed };
  }

  return {
    listCampaigns, getCampaign, createCampaign, updateCampaign, deleteCampaign, scheduleCampaign,
    setSequenceSteps, listSenders, attachSenders, pauseCampaign, resumeCampaign,
    getCampaignStats, statsProbe, sendTest, listReplies, listAllReplies, markInterested, sendReply, createWebhook,
    ensureCustomVariables, createLead, detachLead, listCampaignLeads, attachLeads, pushLeadsToCampaign,
  };
}

export type BisonClient = ReturnType<typeof bisonClient>;

/** Resolve a workspace's ctx and return a client bound to it. The main entry point. */
export async function bisonClientFor(workspaceId?: number | null): Promise<BisonClient> {
  return bisonClient(await ctxForWorkspace(workspaceId));
}
