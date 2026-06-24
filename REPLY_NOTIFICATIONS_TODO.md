# Reply notifications — follow-ups to verify

Status as of 2026-06-24. The reply → Google Chat alert + in-app handoff is built and deployed.
Outbound delivery is confirmed (a direct POST to the Google Chat space returned 200 and posted a
message). The items below are NOT yet verified and should be closed out.

## 1. Confirm the inbound leg: Bison → our webhook  ⚠️ UNVERIFIED
We proved we can post TO Google Chat, but not that a real Bison reply reaches us and triggers it.
- Check Email Bison → Settings → Webhooks: the **"Contact Replied"** event must POST to
  `https://gtm.startupscience.io/api/webhooks/bison/<BISON_WEBHOOK_SECRET>`.
- To test without waiting for a live reply, POST a synthetic event to that URL (needs the secret)
  and confirm an alert lands in the Chat space naming the round-robin rep.

## 2. Lock down Bison reply-event field names  ⚠️ UNVERIFIED
The webhook parses `reply_id` / `sender_email_id` defensively (`src/api/routes/webhooks.ts`), but
the exact field names weren't confirmed against a real payload. Grab one real "Contact Replied"
sample payload from Bison and confirm:
- the Bison **reply id** → stored as `bison_replies.bison_reply_ext_id` (powers the in-app reply button)
- the **sender inbox id** → stored as `bison_replies.sender_email_id`
If the field names differ, fix the parse. Without a valid `bison_reply_ext_id`, the in-app "reply
through Bison" button falls back to "open in Bison".

## 3. Bison unibox deep-link URL (fallback) — NOT BUILT
The "open in Bison" fallback needs the unibox thread URL shape for this Bison instance. Add it to
the Inbox once known.

## 4. HubSpot sync — BUILT BUT HELD BACK (intentional)
On hold until the HubSpot contact objects/properties are fixed. Code is intact in
`src/engine/notify/hubspotSync.ts`, gated off by default.
- Enable with env `REPLY_HUBSPOT_SYNC=1` (no code change).
- Before enabling, confirm `hs_lead_status='REPLIED'` is a real internal value in the portal
  (and `lifecyclestage='marketingqualifiedlead'`). Adjust the constants in hubspotSync.ts if not.

## Already done
- Migration 0011 applied to prod (notify_routes + bison_replies handoff columns).
- Rosters seeded in prod: global default = Gary Horn; ESO = Shivam Seth (edit in Settings → Reply routing).
- GOOGLE_CHAT_WEBHOOK_URL set in Railway.
- Plan: ~/.claude/plans/jaunty-greeting-hinton.md
