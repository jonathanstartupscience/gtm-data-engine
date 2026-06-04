/**
 * HeyReach adapter — LinkedIn outreach. Verified against the public API (2026-06):
 *   Base: https://api.heyreach.io/api/public · Auth header: X-API-KEY · 300 req/min.
 * HeyReach is sync+push+monitor oriented: campaigns are built in HeyReach's UI; the API adds
 * leads to ACTIVE campaigns, reads stats, and reads the inbox/conversations.
 *
 * Confirmed endpoints used here:
 *   GET  /auth/CheckApiKey
 *   POST /campaign/GetAll                  {offset,limit,...} → {totalCount, items[]}
 *   GET  /campaign/GetById?campaignId=
 *   POST /campaign/Pause?campaignId=
 *   POST /campaign/Resume?campaignId=
 *   POST /list/GetAll | /list/CreateEmptyList
 *   POST /lead/AddLeadsToCampaignV2        (requires ACTIVE campaign)
 *   POST /stats/GetOverallStats
 *   POST /inbox/GetConversationsV2
 * No LinkedIn-account-list or API campaign-create endpoint exists — handled by degrading gracefully.
 */
import { config } from '../../lib/config.js';
import { request, requestJson, RateLimiter } from '../../lib/http.js';

const BASE = (config.heyreachBase || 'https://api.heyreach.io/api/public').replace(/\/$/, '');
const limiter = new RateLimiter(250, 60_000); // under the 300/min cap
const headers = () => ({ 'X-API-KEY': config.heyreachKey, 'Content-Type': 'application/json' });

export function isConfigured(): boolean { return !!config.heyreachKey; }

/** Validate the API key. Returns {ok,status}. */
export async function checkApiKey(): Promise<{ ok: boolean; status: number }> {
  if (!config.heyreachKey) return { ok: false, status: 0 };
  const r = await request(`${BASE}/auth/CheckApiKey`, { headers: headers(), limiter });
  return { ok: r.ok, status: r.status };
}

export interface HrCampaign { id: number; name: string; status?: string; [k: string]: unknown }

/** List ALL campaigns (paginates via offset/limit). */
export async function listCampaigns(): Promise<HrCampaign[]> {
  const all: HrCampaign[] = [];
  let offset = 0; const limit = 100;
  for (;;) {
    const j = await requestJson<{ totalCount?: number; items?: HrCampaign[] }>(`${BASE}/campaign/GetAll`, {
      method: 'POST', headers: headers(), limiter, body: JSON.stringify({ offset, limit }),
    });
    const items = j.items ?? [];
    all.push(...items);
    offset += limit;
    if (!items.length || (j.totalCount != null && offset >= j.totalCount)) break;
  }
  return all;
}

export async function getCampaign(campaignId: number): Promise<HrCampaign | null> {
  const resp = await request(`${BASE}/campaign/GetById?campaignId=${campaignId}`, { headers: headers(), limiter });
  if (!resp.ok) return null;
  return (await resp.json()) as HrCampaign;
}

export async function pauseCampaign(campaignId: number): Promise<Response> {
  return request(`${BASE}/campaign/Pause?campaignId=${campaignId}`, { method: 'POST', headers: headers(), limiter });
}
export async function resumeCampaign(campaignId: number): Promise<Response> {
  return request(`${BASE}/campaign/Resume?campaignId=${campaignId}`, { method: 'POST', headers: headers(), limiter });
}

export interface HrLead {
  firstName?: string; lastName?: string; profileUrl?: string; emailAddress?: string;
  companyName?: string; position?: string; location?: string;
  customUserFields?: { name: string; value: string }[];
}

export interface HrPushResult { added: number; updated: number; failed: number }

/**
 * Add leads to an ACTIVE campaign. Each lead pairs to a sender LinkedIn account; if no specific
 * sender is given, HeyReach assigns from the campaign's attached accounts (we pass null to let it).
 */
export async function addLeadsToCampaign(campaignId: number, leads: HrLead[], linkedInAccountId?: number): Promise<HrPushResult> {
  const body = {
    campaignId,
    accountLeadPairs: leads.map((lead) => ({ linkedInAccountId: linkedInAccountId ?? null, lead })),
    resumeFinishedCampaign: false, resumePausedCampaign: true,
  };
  const j = await requestJson<{ addedLeadsCount?: number; updatedLeadsCount?: number; failedLeadsCount?: number }>(
    `${BASE}/lead/AddLeadsToCampaignV2`, { method: 'POST', headers: headers(), limiter, body: JSON.stringify(body) });
  return { added: j.addedLeadsCount ?? 0, updated: j.updatedLeadsCount ?? 0, failed: j.failedLeadsCount ?? 0 };
}

export interface HrStats { [k: string]: unknown }
/** Overall account/campaign stats. Optionally scope by campaign ids + date range. */
export async function getOverallStats(body: Record<string, unknown> = {}): Promise<HrStats | null> {
  const resp = await request(`${BASE}/stats/GetOverallStats`, {
    method: 'POST', headers: headers(), limiter, body: JSON.stringify(body),
  });
  if (!resp.ok) return null;
  return (await resp.json()) as HrStats;
}

export interface HrConversation {
  id?: string | number; campaignId?: number;
  correspondentProfile?: { firstName?: string; lastName?: string; profileUrl?: string; companyName?: string };
  lastMessage?: { body?: string; text?: string; createdAt?: string; sender?: string };
  read?: boolean; [k: string]: unknown;
}

/** Read inbox conversations (replies). Filters supported via body (campaign ids, unread, etc.). */
export async function getConversations(body: Record<string, unknown> = {}): Promise<HrConversation[]> {
  const resp = await request(`${BASE}/inbox/GetConversationsV2`, {
    method: 'POST', headers: headers(), limiter, body: JSON.stringify({ offset: 0, limit: 100, ...body }),
  });
  if (!resp.ok) return [];
  const j = (await resp.json()) as { items?: HrConversation[]; conversations?: HrConversation[] };
  return j.items ?? j.conversations ?? [];
}
