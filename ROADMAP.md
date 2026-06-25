# GTM Data Engine — product roadmap

Internal planning doc: what's shipped, what's queued, and what we deliberately deferred or dropped.
Not user-facing (that's the in-app knowledge base). Keep this current as decisions change.

_Last updated: 2026-06-25_

---

## Recently shipped

- **Reply triage agent** (Email Engine) — every inbound reply is read by Opus: suggests a one-line
  response strategy, suppresses no-action auto-replies from the leads channel, and extracts referral
  contacts ("I've left, email X") into an auto-created lead pending a one-click add-to-campaign.
- **Global Settings** — one account-wide panel; connectors and their API keys unified into one
  editable list; credit balances with refresh.
- **Unified sidebar** — all three engines (Data / Email / LinkedIn) visible at once as collapsible
  sections, current expanded; per-engine color identity. The Bison "Workspace" persona picker nests
  under the Email engine (term kept to match Bison).
- **Clarity + consistency passes** — app-wide copy tightening, a shared CSS class vocabulary,
  PageHeader/EmptyState pattern, breadcrumbs, recents in the sidebar.
- **Comprehensive audit batch** — referral double-create race fixed; vendor cost re-check at confirm;
  accessibility (focus rings, keyboard-sortable tables, HelpDrawer modal); route code-splitting
  (main bundle ~507KB → ~75KB). See PRs #8, #9.

---

## Now / next

- **Visual design pass** — pure design quality on top of the now-clean, consistent foundation.
  Started as a separate Claude Code session to keep context focused. The frontend-design plugin is
  the tool; brand tokens (warm off-white, indigo #4d4d9d, green #65c238, DM Serif Display / DM Sans)
  stay fixed. Goal: elevate hierarchy, spacing rhythm, and polish — not a bold restyle.

---

## Deferred — decided, not yet scheduled

- **In-app LinkedIn reply.** We currently treat the LinkedIn inbox as view-only ("open in LinkedIn to
  reply"). **The HeyReach API actually supports sending** — confirmed against their public API (the
  Make.com "Send message" action, the CLI `inbox send`, and HeyReach's own Campaign API docs), on the
  same key/auth/rate-limit (`api.heyreach.io/api/public/`, `X-API-KEY`, 300 req/min) our adapter
  already uses. So this is a real future option, **not a platform limit**. To build it we'd add two
  adapter functions we don't have yet — a conversation thread/messages fetch, and a send call taking
  `conversationId` + `accountId` (the LinkedIn sender) + message text — then mirror the Bison inbox
  reply UX. Caveat: the exact public endpoint paths should be confirmed against a live request before
  wiring the UI to "reply here." Until built, the view-only framing stays honest (it does not claim
  in-app reply is impossible). See `src/engine/adapters/heyreach.ts` (inbox is read-only today via
  `getConversations` → `POST /inbox/GetConversationsV2`).

- **Detail-page depth** — campaign → its audience contacts drill-down, richer CompanyDetail actions,
  a CampaignBuilder step indicator. Surfaced in the UX audit (Batch 5); breadcrumbs + the
  inbox→campaign link shipped, the deeper drill-downs did not.

- **Reply HubSpot sync** — built but flag-gated off (`REPLY_HUBSPOT_SYNC`) until the CRM
  objects/properties are finalized. Promotes a replied contact to MQL / lead status REPLIED.

---

## Dropped — considered and declined

- **⌘K command palette / global search.** Proposed in the audit as the biggest findability upgrade
  beyond the sidebar. Declined for now — not a priority; the unified sidebar covers top-level
  navigation well enough. Revisit only if navigating to specific records by name becomes a real pain.

- **Forced Email/LinkedIn inbox parity.** Originally assumed HeyReach was too constrained to match the
  Bison inbox. That assumption was wrong (see "in-app LinkedIn reply" above), so the decision is no
  longer "can't" — it's "not yet prioritized." We are NOT forcing artificial parity; each inbox does
  what its workflow needs.

---

## Pending env / ops (set in Railway when enabling features)

`APP_ENCRYPTION_KEY` · `ANTHROPIC_API_KEY` · `BISON_WEBHOOK_SECRET` · `HEYREACH_API_KEY` ·
`REPLY_HUBSPOT_SYNC=1` (turns on reply→CRM promotion) · `API_SERVICE_TOKEN` (headless API callers).
