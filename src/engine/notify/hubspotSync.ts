/**
 * On an inbound cold-email reply, promote the contact in HubSpot so it enters the sales workflow:
 * set lifecycle = MQL and lead status = REPLIED. Creates the contact if HubSpot doesn't have it yet,
 * then mirrors the change into our canonical store so our DB + the hubspot_id identifier stay in sync.
 *
 * Internal HubSpot values (confirm against the live portal — see plan verification step):
 *   lifecyclestage = 'marketingqualifiedlead'  (standard MQL internal value)
 *   hs_lead_status = 'REPLIED'                  (must exist as an option on the dropdown)
 */
import { config } from '../../lib/config.js';
import { searchContactByEmail, createContact, patchContact } from '../adapters/hubspot.js';
import { resolveContact } from '../resolve.js';

const MQL_LIFECYCLE = 'marketingqualifiedlead';
const REPLIED_STATUS = 'REPLIED';

export interface ReplyForSync {
  leadEmail?: string | null;
  leadName?: string | null;
}

/** Create-or-update the HubSpot contact for a reply, setting MQL + REPLIED. Best-effort; throws on hard failure. */
export async function syncReplyToHubspot(reply: ReplyForSync): Promise<void> {
  const email = (reply.leadEmail ?? '').trim();
  if (!email) return;                       // nothing to key on
  if (!config.hubspotToken) {               // HubSpot not configured — skip quietly
    console.warn('[reply→hubspot] no HUBSPOT_TOKEN set; skipping CRM sync for', email);
    return;
  }

  const [firstName, ...rest] = (reply.leadName ?? '').trim().split(/\s+/);
  const lastName = rest.join(' ');
  const props: Record<string, string> = {
    lifecyclestage: MQL_LIFECYCLE,
    hs_lead_status: REPLIED_STATUS,
  };
  if (firstName) props.firstname = firstName;
  if (lastName) props.lastname = lastName;

  const existing = await searchContactByEmail(email);
  let hubspotId: string | undefined;
  if (existing?.id) {
    await patchContact(existing.id, props);
    hubspotId = existing.id;
  } else {
    const resp = await createContact({ email, ...props });
    if (resp.ok) {
      const j = (await resp.json().catch(() => null)) as { id?: string } | null;
      hubspotId = j?.id;
    } else if (resp.status === 409) {
      // Race: created between our search and create — fall back to patch.
      const again = await searchContactByEmail(email);
      if (again?.id) { await patchContact(again.id, props); hubspotId = again.id; }
    } else {
      // Surface the status + body so a transient failure is diagnosable in logs (the caller catches
      // and logs this — the reply notification still succeeds; only the CRM promotion is skipped).
      const body = await resp.text().catch(() => '');
      throw new Error(`HubSpot createContact failed (${resp.status})${body ? `: ${body.slice(0, 200)}` : ''}`);
    }
  }

  // Mirror into our canonical store (local-only; does not call HubSpot).
  await resolveContact({
    email, firstName: firstName || undefined, lastName: lastName || undefined,
    lifecycleStage: MQL_LIFECYCLE, leadStatus: REPLIED_STATUS, hubspotId,
  }, 'bison-reply');
}
