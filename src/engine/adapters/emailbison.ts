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

/** List campaigns in the (single) workspace this key belongs to. */
export async function listCampaigns(): Promise<BisonCampaign[]> {
  const j = await requestJson<{ data?: BisonCampaign[] }>(`${BASE}/campaigns?page=1`, { headers: headers(), limiter });
  return j.data ?? [];
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
