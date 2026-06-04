/**
 * Email Bison adapter — cold-email activation. Verified against docs (see VENDOR_API_REFERENCE).
 * Base is instance-specific (EMAILBISON_BASE_URL) · auth: Authorization: Bearer.
 * Adding a lead to a campaign is TWO steps: create lead → attach by id.
 */
import { config } from '../../lib/config.js';
import { request, requestJson, RateLimiter } from '../../lib/http.js';

const BASE = config.emailBisonBase.replace(/\/$/, '');
const limiter = new RateLimiter(500, 60_000); // conservative; docs imply ~10/s
const headers = () => ({ Authorization: `Bearer ${config.emailBisonKey}`, 'Content-Type': 'application/json' });

export interface BisonCampaign { id: number; name: string; status?: string }

/** List ALL campaigns in the (single) workspace, following Laravel pagination. */
export async function listCampaigns(): Promise<BisonCampaign[]> {
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
export async function getCampaign(id: number): Promise<Record<string, unknown> | null> {
  const resp = await request(`${BASE}/campaigns/${id}`, { headers: headers(), limiter });
  if (!resp.ok) return null;
  const j = (await resp.json()) as { data?: Record<string, unknown> };
  return j.data ?? (j as Record<string, unknown>);
}

/** Create a campaign (name only — sequence/schedule/senders configured separately). */
export async function createCampaign(name: string): Promise<{ id: number } | null> {
  const resp = await request(`${BASE}/campaigns`, {
    method: 'POST', headers: headers(), limiter, body: JSON.stringify({ name }),
  });
  if (!resp.ok) return null;
  const j = (await resp.json()) as { id?: number; data?: { id?: number } };
  const id = j.id ?? j.data?.id;
  return id ? { id } : null;
}

/** Update campaign limits / tracking settings. */
export async function updateCampaign(id: number, patch: Record<string, unknown>): Promise<Response> {
  return request(`${BASE}/campaigns/${id}/update`, {
    method: 'PATCH', headers: headers(), limiter, body: JSON.stringify(patch),
  });
}

export interface BisonScheduleDay { day: string; from: string; to: string }
export interface BisonSchedule { timezone: string; days: BisonScheduleDay[] }

/** Set a campaign's sending schedule (days/times/timezone). */
export async function scheduleCampaign(id: number, schedule: BisonSchedule): Promise<Response> {
  return request(`${BASE}/campaigns/${id}/schedule`, {
    method: 'POST', headers: headers(), limiter, body: JSON.stringify(schedule),
  });
}

export interface BisonSequenceStep {
  email_subject: string; email_body: string; wait_in_days: number; order: number;
  thread_reply?: boolean; variant?: string;
}

/** Replace/define the sequence steps for a campaign (array of steps). */
export async function setSequenceSteps(id: number, steps: BisonSequenceStep[]): Promise<Response> {
  return request(`${BASE}/campaigns/${id}/sequence-steps`, {
    method: 'POST', headers: headers(), limiter, body: JSON.stringify({ steps }),
  });
}

export interface BisonSender { id: number; email: string; name?: string; daily_limit?: number }

/** List sender inboxes available in the workspace. */
export async function listSenders(): Promise<BisonSender[]> {
  const resp = await request(`${BASE}/sender-emails`, { headers: headers(), limiter });
  if (!resp.ok) return [];
  const j = (await resp.json()) as { data?: BisonSender[] };
  return j.data ?? [];
}

/** Attach sender inboxes to a campaign. */
export async function attachSenders(id: number, senderEmailIds: number[]): Promise<Response> {
  return request(`${BASE}/campaigns/${id}/attach-sender-emails`, {
    method: 'POST', headers: headers(), limiter, body: JSON.stringify({ sender_email_ids: senderEmailIds }),
  });
}

/** Pause / resume a campaign (resume == launch a configured campaign). */
export async function pauseCampaign(id: number): Promise<Response> {
  return request(`${BASE}/campaigns/${id}/pause`, { method: 'PATCH', headers: headers(), limiter });
}
export async function resumeCampaign(id: number): Promise<Response> {
  return request(`${BASE}/campaigns/${id}/resume`, { method: 'PATCH', headers: headers(), limiter });
}

export interface BisonStats {
  sent?: number; opens?: number; replies?: number; bounces?: number;
  interested?: number; unsubscribed?: number; [k: string]: unknown;
}

/** Fetch a campaign's aggregate stats (sent/opens/replies/bounces…). */
export async function getCampaignStats(id: number): Promise<BisonStats | null> {
  const resp = await request(`${BASE}/campaigns/${id}/stats`, { headers: headers(), limiter });
  if (!resp.ok) return null;
  const j = (await resp.json()) as { data?: BisonStats };
  return j.data ?? (j as BisonStats);
}

/** Send a test email of the sequence to an address (sanity check before launch). */
export async function sendTest(id: number, email: string): Promise<Response> {
  return request(`${BASE}/campaigns/${id}/send-test`, {
    method: 'POST', headers: headers(), limiter, body: JSON.stringify({ email }),
  });
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

/**
 * List recent replies from the unibox/inbox. Bison's exact path varies by instance — try the
 * documented `/replies` then fall back to `/unibox`. Returns [] if neither responds (so the
 * UI degrades gracefully). Verify the live shape on deploy.
 */
export async function listReplies(page = 1): Promise<BisonReply[]> {
  for (const path of [`/replies?page=${page}`, `/unibox?page=${page}`, `/inbox?page=${page}`]) {
    const resp = await request(`${BASE}${path}`, { headers: headers(), limiter });
    if (resp.ok) {
      const j = (await resp.json()) as { data?: BisonReply[]; items?: BisonReply[] };
      return j.data ?? j.items ?? [];
    }
    if (resp.status !== 404) break; // a non-404 error means the path exists but failed — stop trying alternates
  }
  return [];
}

/** Mark a lead/reply as interested in Bison (best-effort; path unverified). */
export async function markInterested(leadEmail: string, campaignId?: number): Promise<Response> {
  return request(`${BASE}/leads/mark-interested`, {
    method: 'POST', headers: headers(), limiter,
    body: JSON.stringify({ email: leadEmail, campaign_id: campaignId }),
  });
}

/** Register a webhook so Bison pushes reply/bounce/etc. events to our receiver. */
export async function createWebhook(url: string, eventTypes: string[]): Promise<Response> {
  return request(`${BASE}/webhooks`, {
    method: 'POST', headers: headers(), limiter,
    body: JSON.stringify({ url, event_types: eventTypes }),
  });
}

export interface BisonLead {
  email: string; first_name?: string; last_name?: string;
  title?: string; company?: string; custom_variables?: { name: string; value: string }[];
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

export interface BisonPushResult { created: number; attached: number; failed: number }

/** Push contacts into a campaign: create each lead, then attach the batch. */
export async function pushLeadsToCampaign(
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
