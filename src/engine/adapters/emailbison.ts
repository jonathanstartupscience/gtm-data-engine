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

/** Per-workspace Bison connection: a base URL + an API key. */
export interface BisonCtx { base: string; key: string; }

/** Resolve a workspace's Bison ctx (its own key + base). No global key — an unconfigured workspace gets an empty key and can't send. */
export async function ctxForWorkspace(workspaceId?: number | null): Promise<BisonCtx> {
  let slug: string | undefined;
  let baseOverride: string | null = null;
  if (workspaceId) {
    const [w] = await db.select({ slug: workspaces.slug, bisonBaseUrl: workspaces.bisonBaseUrl })
      .from(workspaces).where(eq(workspaces.id, workspaceId));
    slug = w?.slug;
    baseOverride = w?.bisonBaseUrl ?? null;
  }
  const [key, base] = await Promise.all([bisonKeyFor(slug), bisonBaseFor(baseOverride)]);
  return { key, base: base.replace(/\/$/, '') };
}

export interface BisonCampaign { id: number; name: string; status?: string }
export interface BisonScheduleDay { day: string; from: string; to: string }
export interface BisonSchedule { timezone: string; days: BisonScheduleDay[] }
export interface BisonSequenceStep {
  email_subject: string; email_body: string; wait_in_days: number; order: number;
  thread_reply?: boolean; variant?: string;
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

  /** List ALL campaigns in this workspace, following Laravel pagination. */
  async function listCampaigns(): Promise<BisonCampaign[]> {
    const all: BisonCampaign[] = [];
    let page = 1;
    for (;;) {
      const j = await requestJson<{ data?: BisonCampaign[]; meta?: { current_page: number; last_page: number } }>(
        `${BASE}/campaigns?page=${page}`, { headers: headers(), limiter });
      all.push(...(j.data ?? []));
      const meta = j.meta;
      if (!meta || meta.current_page >= meta.last_page || !j.data?.length) break;
      page++;
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

  /** Set a campaign's sending schedule (days/times/timezone). */
  function scheduleCampaign(id: number, schedule: BisonSchedule): Promise<Response> {
    return request(`${BASE}/campaigns/${id}/schedule`, {
      method: 'POST', headers: headers(), limiter, body: JSON.stringify(schedule),
    });
  }

  /** Replace/define the sequence steps for a campaign (array of steps). */
  function setSequenceSteps(id: number, steps: BisonSequenceStep[]): Promise<Response> {
    return request(`${BASE}/campaigns/${id}/sequence-steps`, {
      method: 'POST', headers: headers(), limiter, body: JSON.stringify({ steps }),
    });
  }

  /** List sender inboxes available in this workspace. */
  async function listSenders(): Promise<BisonSender[]> {
    const resp = await request(`${BASE}/sender-emails`, { headers: headers(), limiter });
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

  /** Create a lead; returns its id (response shape varies — pull id defensively). */
  async function createLead(lead: BisonLead): Promise<number | null> {
    const resp = await request(`${BASE}/leads`, {
      method: 'POST', headers: headers(), limiter, body: JSON.stringify(lead),
    });
    if (!resp.ok) return null;
    const j = (await resp.json()) as { id?: number; data?: { id?: number } };
    return j.id ?? j.data?.id ?? null;
  }

  /** Attach lead ids to a campaign. */
  async function attachLeads(campaignId: number, leadIds: number[]): Promise<void> {
    if (!leadIds.length) return;
    await requestJson(`${BASE}/campaigns/${campaignId}/leads/attach-leads`, {
      method: 'POST', headers: headers(), limiter, body: JSON.stringify({ lead_ids: leadIds }),
    });
  }

  /** Push contacts into a campaign: create each lead, then attach the batch. */
  async function pushLeadsToCampaign(
    campaignId: number,
    leads: BisonLead[],
    log: (m: string) => void = console.log,
  ): Promise<BisonPushResult> {
    let created = 0, failed = 0;
    const ids: number[] = [];
    for (let i = 0; i < leads.length; i++) {
      const id = await createLead(leads[i]);
      if (id) { ids.push(id); created++; } else failed++;
      if ((i + 1) % 50 === 0) log(`  created ${i + 1}/${leads.length} leads…`);
    }
    // attach in chunks of 100
    let attached = 0;
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      await attachLeads(campaignId, chunk);
      attached += chunk.length;
    }
    return { created, attached, failed };
  }

  return {
    listCampaigns, getCampaign, createCampaign, updateCampaign, scheduleCampaign,
    setSequenceSteps, listSenders, attachSenders, pauseCampaign, resumeCampaign,
    getCampaignStats, sendTest, listReplies, listAllReplies, markInterested, sendReply, createWebhook, pushLeadsToCampaign,
  };
}

export type BisonClient = ReturnType<typeof bisonClient>;

/** Resolve a workspace's ctx and return a client bound to it. The main entry point. */
export async function bisonClientFor(workspaceId?: number | null): Promise<BisonClient> {
  return bisonClient(await ctxForWorkspace(workspaceId));
}
