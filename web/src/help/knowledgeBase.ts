/**
 * KNOWLEDGE BASE — the single source of truth for in-app help.
 *
 * ⚠️ MAINTENANCE RULE (keep this current as features ship):
 *   Whenever you add or change a PAGE or a major capability, update this file IN THE SAME CHANGE:
 *     • New route?      → add a PAGES[route] entry (title, intro, sections, optional steps).
 *     • New concept?    → add/extend a CONCEPTS entry (golden records, taxonomy, credit safety…).
 *     • Behavior change? → fix the affected entry's wording so it matches what the app now does.
 *   The Help drawer (contextual, per page) and the "How it works" KB page both render FROM HERE,
 *   so one edit updates both. A stale KB is a bug — treat it like one.
 *   (See CLAUDE.md → "Knowledge base upkeep".)
 *
 * Last reviewed: 2026-06-25h (Email Engine stats + inbox fixes — campaign stats now auto-refresh from Bison on open: Performance refreshes every campaign in the workspace when you open it (new POST /campaigns/refresh-all-stats, resilient per-campaign), and a campaign’s detail page refreshes its own stats on open, so the numbers track Bison without a manual click (manual Refresh still available). Opens read 0% when open-tracking is off in Bison — shown, not estimated. Inbox: “Positive only” (on by default) now surfaces the count of hidden auto-replies/OOO/bounces with a “Show all” link, so an actionable-only view never reads as a broken/empty inbox (the page fetches the full reply set and filters client-side). Behavior of triage/suppression itself is unchanged. Earlier — 2026-06-25g (Comprehensive audit batch — shipped after a 5-dimension parallel audit. Correctness: fixed a referral-lead double-create race (atomic claim on bison_replies.referralStatus), added a server-side vendor cost re-check at Find-Contacts confirm (409 if the live scope now costs materially more than previewed), hardened HubSpot reply-sync logging + Bouncer batch-create. UX/visual/copy/a11y: error messages now say what broke + how to fix (no more raw "Failed: [object Object]"); error/not-found states use a distinct error-state/EmptyState (not the loading class); remaining monospace log blocks unified to .codeblock and notice boxes to callout-*; sortable table headers are now real keyboard-operable buttons with aria-sort; HelpDrawer is a proper modal (Escape to close, focus trap-in/restore, role=dialog); icon-only controls got aria-labels; a global :focus-visible ring + prefers-reduced-motion. Navigation: detail pages (Campaign/Experiment/Company) use a shared Breadcrumb; the Inbox reply card links to its campaign; a "Recent" section pins recently-visited detail pages atop the sidebar. Performance: routes are code-split (main bundle ~507KB → ~75KB). LinkedIn inbox stays "open in LinkedIn to reply" for now (HeyReach's API does support sending — a future in-app-reply option, not a hard limit). Page BEHAVIOR is otherwise unchanged. Earlier — 2026-06-25f (Clarity pattern roll-out — shared PageHeader (title + one primary action, baseline-aligned) and EmptyState components applied across the app. List pages get their single primary action in the header; form/builder/detail/wizard pages get a header with NO action (the primary button stays in the flow). Bare "No X yet" lines became real empty states (title + a hint that adds info, not an echo of the button). Copy tightened again — dropped explain-the-obvious subtitles. Refined primary-button affordance; workspace switcher now reads as a top-level engine switch (color-tinted + glyph badge per engine: Data green / Email purple / LinkedIn blue). Display strings + header structure + button relocation only — no logic/behavior changed. Page BEHAVIOR unchanged, so per-page KB entries remain accurate. Earlier — 2026-06-25e (Visual consistency pass v1 — added a shared class vocabulary in styles.css (spacing scale mt-/mb-, text-sm/text-xs/text-error, row/row-between/col, callout + severity variants, codeblock, subsection) and migrated repeated ad-hoc inline styles across ~21 pages to it, so the same logical element (notices, header rows, helper text, error text) looks identical everywhere. Mechanical refactor — style/className attributes only; no copy, JSX, or behavior changed. Genuinely one-off layout (computed widths, dynamic borders, grid tracks) stays inline by design. Known remaining inconsistency to address later: the monospace log/preview blocks still vary slightly page-to-page (font-size/border/bg) — left as-is this pass rather than risk a visible change. This is groundwork for a later per-page visual redesign via the frontend-design plugin. KB content unchanged. Earlier — 2026-06-25d (App-wide copy density pass — tightened interface copy across ~22 pages + the sequence generator to a single editorial standard: cut throat-clearing/marketing voice, one terse line of helper text only where non-obvious, sentence case, verb buttons, structure over prose (Linear/Slack density + anti-AI-writing principles). Display strings only — no logic/JSX/behavior changed. Load-bearing explanations were deliberately PRESERVED in terse form: the experiment contact-pinning rationale (why an A/B comparison stays clean), arm-weight/pause semantics, vendor credit-spend cautions (Discover/Classify/Runs/FindContacts), destructive-action and "nothing written until you confirm" cautions (Sync/Campaigns), and the reply-triage/referral Inbox labels. Page BEHAVIOR is unchanged, so the per-page KB entries below remain accurate. Earlier — 2026-06-25c (Settings UI cleanup — Connectors and their API keys are now ONE unified list: each connector is a row with a status dot, masked key, and inline Edit/Add-key control, so a broken connector is fixed where it’s shown (no more separate keys section + status view). All vendor keys are now settable in-app (HubSpot/Ocean/Bouncer/Airscale were env-only before — added to the managed list). Helper text trimmed to terse one-line hints. Credit balances render as bullets with a last-updated tag + a Refresh button (was a prose sentence, no timestamp). The per-workspace pointer is a one-line link, not a paragraph. Backend: /connectors returns key name + masked + source per connector; /connectors/credits returns structured metrics[] + fetchedAt; managed-key `help` field renamed to terse `hint`. NOTE: this is the first page of an app-wide density pass — the same over-explaining pattern (verbose helper text under labels) still exists on other pages and will be cleaned up in follow-ups. Earlier — 2026-06-25b (Global Settings consolidation — there is now ONE account-wide Settings panel for the whole GTM system, reached from a ⚙ Settings link pinned at the bottom of the sidebar (above the profile) in EVERY workspace. It absorbs what used to be three scattered places: the old Settings page (vendor keys), the Data-Engine Connectors page (status + credit balances — /connectors now redirects into Settings, the standalone page is removed), so keys + connector status + credits are one screen, clearly labeled global. Logs & Health is promoted to a global nav item in the same bottom zone (it’s system-wide health, not Data-only) — NOT inside Settings, since it’s operational not configuration. Per-workspace Email settings deliberately stay put: each persona workspace’s Bison key, persona scope, and reply-routing roster remain on Email Engine → Workspaces because they’re per-workspace, not global; Settings links over to them. WorkspaceSwitcher no longer lists /settings under the LinkedIn workspace (it was only reachable there before — the root confusion). Earlier — 2026-06-25 (Reply triage agent — every new reply is read by an AI step (Opus) before any alert fires. It classifies the reply, and: (1) suppresses no-action replies (bare OOO, unsubscribe, bounce) from the Google Chat leads channel entirely — they still land in the in-app Inbox; (2) attaches a one-sentence suggested-strategy line to the alert + Inbox card for genuine human replies; (3) when a reply points to someone else (OOO naming a colleague, or “I’ve left, email X”), extracts THAT person’s email from the body — distinguishing it from the sender’s own address and signature/social/legal noise — auto-creates them as a lead in the workspace’s Bison, and posts a “Referral captured” card. The add-to-campaign step stays a manual confirm (Inbox referral box, or the Chat card’s deep-link) so a mis-parsed address is never cold-emailed automatically; the card flags inferred names and different-domain referrals. New bison_replies columns: triage_category/triage_actionable/triage_strategy/referral/referral_lead_id/referral_status. Triage degrades gracefully — no Anthropic key → replies notify as before. Earlier — 2026-06-24d (ESO-build hardening — the Email Engine now matches the live Bison instance end-to-end. Bison adapter payload shapes corrected to what the instance accepts (schedule = per-day booleans + H:i times + save_as_template; sequence-steps = {title, sequence_steps} with wait_in_days≥1, and it APPENDS so it’s posted once on a fresh campaign — edit = delete+recreate; createLead ensures custom variables exist first; lead removal is DELETE /leads/:id; listSenders surfaces 401/403 instead of returning an empty list). Copy is standardized on the instance dialect: single-brace UPPERCASE merge tags ({FIRST_NAME}, {COMPANY}, {TITLE}, {LAST_NAME}, custom {PERSONA}/{SUB_TYPE}), bodies converted to spaced HTML with <p><br></p> gaps, sign-offs stripped (Bison injects the per-inbox signature) — done by a shared formatter at the build boundary. Workspace→persona binding now supports a SET via a personaMatch LIKE pattern (eso = “ESO %”) so granularly-tagged contacts match; Workspaces page gains a Persona scope field + a Test connection button. The Bison instance URL remains ONE shared setting (Settings) — NOT per-workspace; the shared default is now send.visitstartupscience.com. New “Build from sequences” flow stands up an experiment (campaign per arm + senders + wiring) in one call. Experiment preview now reports total daily capacity, shared-sender warnings, missing-company count, unfillable merge tags, and already-enrolled contacts. Cross-campaign dedup: a push subtracts emails already in the workspace’s other campaigns so nobody is double-emailed. In-step subject A/B variants removed — this Bison version has no variant API; test subjects as separate experiment arms. Earlier — Bison instance URL is ONE shared setting — “Email Bison instance URL” on Settings — because the whole account lives on one Bison host; the workspace is chosen by API key, not URL. (Reverted the per-workspace URL field.) The built-in default dedi.emailbison.com won’t match a custom/dedicated instance, which surfaced as a 500 on Sync and an empty Inbox. Reply sync now pulls the FULL history (pages through all of Bison’s replies, dedup by id) instead of only page 1, so it backfills retroactively. “New Campaign” is no longer a left-nav tab — it’s the “+ New campaign” button on the Campaigns page. Note: legacy campaigns were homed to ESOs by the one-time backfill; re-sync inside the correct workspace to re-home them. Earlier — No global Bison key or global rep roster — each workspace authenticates as itself, mirroring Email Bison which has no shared sending identity. The Workspaces page is now scoped to the ACTIVE workspace only (switch via the nav selector) and shows that workspace’s Bison key + its reply-routing roster; a workspace with no key can’t send. Reply routing is workspace-only (the global default was removed); the Google Chat webhook on Settings remains the shared default ALERT SPACE (a notification channel, not a sending identity) that a workspace can override. Settings keeps HeyReach/Anthropic/Google Chat. Earlier — Reply notifications & speed-to-lead: every reply posts a Google Chat alert that round-robins to a sales rep and deep-links to the Inbox where the rep claims it and replies in-app through Bison. HubSpot promotion on reply (MQL / lead status REPLIED) is built but held back until the CRM objects are finalized — enable with REPLY_HUBSPOT_SYNC=1. Plus: workspace-centric Email Engine — one Bison account, a workspace per persona with its own API key; a workspace selector scopes Campaigns/Sequences/Experiments/Inbox/Performance, and pushes auto-filter to the workspace persona. Experiments doc rewritten in plain terms (horse-race framing, why pinning protects the A/B comparison, the preview→push→iterate loop, and the “link sequence” dropdown is provenance-only — emails send from the arm’s campaign). Community Funding is now an active workspace (all six match Bison names exactly), and a campaigns status light (green = an active campaign is sending, red = none) sits under the workspace selector).
 */

export interface KbSection { heading: string; body: string }
export interface KbPage {
  route: string;
  workspace: 'data' | 'email' | 'linkedin' | 'general';
  title: string;
  intro: string;
  sections: KbSection[];
  steps?: string[];
}

export const GENERAL: KbPage = {
  route: '_general',
  workspace: 'general',
  title: 'What is the GTM platform?',
  intro:
    'Three connected workspaces on one clean dataset. The Data Engine is the single source of truth for go-to-market data — it ingests companies and people, dedupes them, fills and verifies their details, classifies them, and keeps HubSpot clean. The Email Engine and LinkedIn Engine run outreach on top of that clean data.',
  sections: [
    { heading: 'The three workspaces', body: 'Switch with the toggle at the top-left. • Data Engine — your CRM / warehouse (companies, contacts, hygiene, classify, imports, HubSpot sync). • Email Engine — cold email via Email Bison (campaigns, sequences, inbox, performance). • LinkedIn Engine — LinkedIn outreach via HeyReach (sync, push, inbox).' },
    { heading: 'Why it exists', body: 'Instead of cleaning a messy list by hand every time, the engine does it consistently and remembers everything. Every new list reconciles against what we already know, so duplicates and stale data stop piling up — and the cleanup flows back into HubSpot, our system of record.' },
    { heading: 'The core idea: hygiene that reaches HubSpot', body: 'The point isn’t a separate database — it’s a cleaner CRM. When you classify a company, repair a link, or fix a field here, it’s written back to HubSpot too. The Dashboard shows how complete your data is and what’s left to fix.' },
    { heading: 'Vocabulary', body: 'A “company” and a “contact” are golden records with a stable ID. “Type / Sub-type” is our ICP taxonomy (e.g. ESO → University). “Persona” is a contact’s buyer role. “Verification” means an email was checked as real/deliverable. A “run” is one execution of a workflow (recipe).' },
  ],
};

export const CONCEPTS: KbSection[] = [
  { heading: 'Golden records & dedupe', body: 'Every company/contact is matched on domain, email, name+domain, or LinkedIn. If a record already exists, new data updates it instead of creating a duplicate. Existing values are never blanked — we only fill gaps and record where each value came from.' },
  { heading: 'The ICP taxonomy (Type → Sub-type)', body: 'Companies are organized by Type (ESO, Investor, Mentor, Competitor, Partner, Provider, Startup, Vendor, Sponsor) and a Sub-type within it (e.g. University, Venture Capital (VC), Software Provider). This taxonomy drives classification, the pairing hygiene task, and every Type/Sub-type dropdown. Anything outside it is “Not in ICP”.' },
  { heading: 'Personas', body: 'A contact’s buyer role, tagged from their job title. Used for segmentation and outreach targeting. When sourcing contacts you can also search by exact job titles (no persona needed).' },
  { heading: 'Email status', body: '“Deliverable” = safe to cold-email. “Risky (catch-all)” = use cautiously. “Role-based” (info@) = avoid cold email, fine for ads. “Undeliverable” = never send. These come from real Bouncer verification, cached for 90 days.' },
  { heading: 'Credit safety', body: 'Anything that spends a vendor (Ocean, Bouncer, Airscale) shows a cost preview first. Bulk operations run on everything matching; for a controlled spend, select specific rows on Companies/Contacts and use the action bar there. Free, deterministic cleanups (hygiene tasks) are always labeled “Free”.' },
  { heading: 'HubSpot is the system of record', body: 'The engine syncs both ways: pull everything in, push cleaned data back. Pushes always preview the exact field-by-field changes before writing, and never erase existing HubSpot data.' },
  { heading: 'Connecting tools (Settings)', body: 'There is ONE global Settings panel for the whole GTM system — reached from the ⚙ Settings link pinned at the bottom of the sidebar, the same in every workspace (Data, Email, LinkedIn). Connectors and their keys are unified: each external system (HubSpot, HeyReach, Anthropic, Ocean, Bouncer, Airscale, the default Google Chat space, the Bison instance URL) is one row showing status + masked key + an inline edit control, so you set or fix a connector right where its status shows. Keys are encrypted in-app (or set as Railway env vars). The Anthropic key powers everything AI: the in-app classifier (fast/cheap Claude Haiku), the cold-email sequence writer (Claude Opus), and reply triage (Opus). The default Google Chat webhook is where reply alerts post unless a workspace overrides it. Metered vendors (Ocean/Bouncer/Airscale) also show live credit balances with a Refresh. Per-workspace Email settings (each persona’s Bison key, persona scope, reply roster) are NOT global — they live on Email Engine → Workspaces.' },
  { heading: 'Reply notifications & speed-to-lead', body: 'Every inbound reply to a cold email triggers an instant handoff so a human rep can take over while the intent is warm. (1) A Google Chat alert posts to a Chat space and tags the next sales rep in a round-robin roster (set per workspace on the Workspaces page — each workspace owns its own roster); space membership controls who’s notified. Each workspace can post to its own Chat space, or use the shared default space (the Google Chat webhook on Settings). (2) The alert deep-links into the Inbox, where the rep CLAIMS the reply (so two reps don’t collide) and responds in-app; the reply is sent through Email Bison from a chosen sender inbox, threaded on the original. No AI manages replies — reps own every conversation. (Automatic HubSpot promotion on reply — lifecycle to MQL, lead status to REPLIED — is built and held in reserve; it turns on once the CRM objects are finalized.)' },
  { heading: 'Email Engine workspaces', body: 'The Email Engine mirrors Email Bison’s structure: one Bison account with a separate WORKSPACE per persona — ESOs, Founders, Investors, Providers, Advisors, and Community Funding (names match Email Bison exactly). Each workspace is an isolated tenant in Bison with its OWN API key, its own sender inboxes, campaigns, sequences, and inbox. Pick the active workspace from the selector at the top of the Email Engine nav; everything you then see — Campaigns, Sequences, Experiments, Inbox, Performance — is scoped to that one workspace. Under the selector a status light shows whether that workspace is actively sending: GREEN means it has at least one active campaign in Bison, RED means none are sending (it reflects the last campaign sync, so Sync if it looks stale). Each workspace is bound to a persona, so when you push contacts, the canonical store is automatically filtered to that workspace’s persona (you can narrow further by sub-type). Each workspace authenticates with its OWN Bison key — there is no account-wide / global key, because Bison has no shared sending identity; a workspace with no key simply can’t send until one is set. Set the active workspace’s Bison key and its reply-routing roster on the Workspaces page (Email Engine nav → Workspaces), which is scoped to whichever workspace you’ve selected. Switching workspace is how you move between, say, the Founders book of business and the Investors one — they never mix contacts, campaigns, keys, or replies.' },
  { heading: 'Using the Email Engine (end to end)', body: 'The Email Engine turns clean contacts into running cold-email campaigns, in this order. (0) PICK A WORKSPACE — choose the persona workspace (ESOs, Founders, Investors, Providers, Advisors) from the selector at the top of the Email Engine nav; everything below is scoped to it and pushes auto-filter to that workspace’s persona. (1) WRITE SEQUENCES — in Sequences, build a reusable message sequence by hand or with the AI writer (pick a style + persona, Claude drafts it in Greg’s voice). A sequence is a series of steps (subject, body with single-brace UPPERCASE merge tags like {FIRST_NAME}/{COMPANY}, wait days; no sign-off — Bison injects the signature). The AI writer is for NEW sequences; when you reopen one to edit, the screen is steps-first with per-step rewrite actions and a collapsed whole-sequence regenerate instead of the from-scratch setup. (2) BUILD CAMPAIGNS — in Campaigns → New campaign, set name, audience (persona/sub-type, deliverability-gated automatically), schedule, sender inboxes, and attach a sequence (its steps are copied in). Creating sets it up in this workspace’s Email Bison but sends nothing. (3) DISTRIBUTE — for a single campaign, push its audience from the campaign page; to test several sequences against one audience, use an Experiment (Experiments tab) which splits the segment across campaigns and pins each contact. (4) LAUNCH — launch each campaign (confirm-gated). (5) MONITOR — replies land in Inbox (positive first) and fire a Google Chat alert that round-robins to a sales rep; the rep claims the reply and responds in-app. (HubSpot MQL promotion on reply is built but held back for now.) Compare campaigns on Performance. (6) ITERATE — in an experiment, set losers’ weights to 0 and scale winners, add new sequences as arms, add more contacts (only new ones flow). Two ways to populate sequences: the in-app AI writer, or generate them in Claude Code via the cold-email-sequence skill and bulk-load with the seeder (see the repo’s CLAUDE.md / skill).' },
  { heading: 'Variation testing (experiments)', body: 'An experiment is how you test several different messages against ONE audience at the same time, fairly, so you can see which message actually wins. Think of it as a horse race. THE AUDIENCE is the workspace’s persona segment (e.g. all deliverable Founders) — the experiment owns that batch. AN ARM is one horse: one campaign (which carries one sequence — one set of emails) plus a WEIGHT. Weight is that arm’s share of NEW contacts: equal weights = even split, weight 2 vs 1 = about twice as many, weight 0 = paused (no new contacts, keeps the ones it has). PINNING is what makes the test trustworthy. When you push, the engine takes everyone in the segment who isn’t already assigned and drops each contact into exactly one arm, then pins them there for good. It’s deterministic — no coin flip; the same contact always lands in the same arm — so two things hold: (a) re-running the push only sends NEW contacts (nobody already in flight is reshuffled or emailed twice — each assignment is pushed to Bison once), and (b) changing a weight only changes where FUTURE contacts go (people already pinned stay put). That’s what stops an A/B comparison from being corrupted mid-test. THE LOOP: build one campaign per message → create an experiment with one arm per campaign (start with even weights) → Preview shows how many new contacts would flow to each arm → Distribute & push splits, pins, and sends → compare arms on Performance (positive replies, not opens) → to iterate, set losers to weight 0, raise winners, and/or add a new arm with a fresh sequence, then add more contacts for the persona and push again (only the new ones flow, mostly to the winners). Each arm is its own Bison campaign, so Performance compares them directly. Build it from the Experiments tab in the Email Engine. NOTE: in the create form, the per-arm “link sequence” dropdown is provenance only (it records which library sequence an arm represents) — the emails that actually send come from the CAMPAIGN you pick for the arm, so choose the campaign carrying the sequence you mean to test.' },
  { heading: 'Cold email styles & the AI sequence writer', body: 'The Email Engine can draft a whole cold-email sequence for you. You pick a STYLE (a proven strategic skeleton — Three-Paragraph / Khare, Pain-centric, Offer-centric, Authority, Insight, Relevance/Trigger, plus newer ones like Curiosity, Compliment, Question, Benchmark, and Peer/FOMO) and a PERSONA (Founders, ESOs, Universities, Investors, Providers, Chambers, Government, Mentors, Partners — each with its own pain and value). The style fixes how many emails there are and what each one does; Claude writes the actual copy in Gregory Shepard’s voice, following a strict anti-AI-writing rulebook (no em dashes, no buzzwords, no filler). For pain-driven styles you can also target a SPECIFIC named pain for that persona (e.g. ESO → “weak outcomes after Demo Day”) or write your own. Offer styles can lead with one of our lead magnets (the Greg-authored guides/playbooks/audits). If the sending inbox is Greg, it writes in his first person; otherwise it writes as the sender and edifies Greg, since every demo is with Greg personally. Copy uses single-brace UPPERCASE Bison merge tags ({FIRST_NAME}, {COMPANY}, {TITLE}, {LAST_NAME}), so one sequence personalizes itself across the whole segment at send time, and carries no sign-off (Bison injects the signature per inbox). To test subject lines, run two sequences as separate experiment arms — this Bison version has no in-step A/B variant mechanism. Generated copy lands in the editable Steps editor — review and edit before saving. The inputs that produced each sequence (style, persona, pain, offer) are saved with the template, shown as chips in the library, and filterable from the Sequences filter bar. Generating costs one Opus call (labeled “Paid”); editing and saving are free.' },
];

export const PAGES: Record<string, KbPage> = {
  '/': {
    route: '/', workspace: 'data', title: 'Dashboard — Data health',
    intro: 'A live snapshot of the store and how clean it is. The point of the engine is keeping these fields complete — here and in HubSpot.',
    sections: [
      { heading: 'Completeness', body: 'For Type, Sub-type, Persona, and Email-verified, you see the % filled and how many records are still missing it. Click a card to jump to the tool that fills that gap.' },
      { heading: 'The charts', body: 'Companies by Type and Sub-type, contacts by persona, and email deliverability. A red “(Empty — not set)” bar shows how many records are unfilled — that’s the gap to close, not hidden.' },
    ],
  },
  '/discover': {
    route: '/discover', workspace: 'data', title: 'Find Companies',
    intro: 'Grow your account list. Find NEW companies similar to ones you already target, using Ocean.io lookalikes — deduped against what you already have.',
    sections: [
      { heading: 'Two ways to choose seeds', body: 'Use the suggested examples (a spread of your existing companies of a sub-type), OR click “Pick exact companies” to search your full list and check precisely which companies to use as references. Better seeds → better matches.' },
      { heading: 'How lookalikes work', body: 'Ocean finds companies resembling your seeds; new ones are added to the store (existing ones skipped). Set how many to find before running.' },
      { heading: 'If you see a plan message', body: 'Ocean’s lookalike search needs a plan that includes it. Company enrichment still works regardless.' },
    ],
    steps: [
      'Filter by type/sub-type, then either keep the suggested seeds or “Pick exact companies”.',
      'Select the companies to use as references.',
      'Set how many to find, then run.',
      'New, deduped companies land in your store ready to enrich and verify.',
    ],
  },
  '/find-contacts': {
    route: '/find-contacts', workspace: 'data', title: 'Find Contacts',
    intro: 'Source the right people at the companies you care about. Company-first, then precise people filters — the same precision as working directly in Airscale.',
    sections: [
      { heading: 'Step 1 — which companies', body: 'Filter your accounts by Type, Sub-type, and Country. Optionally limit to companies that don’t already have a chosen persona, so you don’t re-source covered accounts.' },
      { heading: 'Step 2 — who (no persona required)', body: 'Search by job titles to include and exclude, location, and a keyword (matches title/bio/skills/education). A persona preset can pre-fill common titles, but you can type any titles and edit freely.' },
      { heading: 'Cost', body: 'A scope preview shows how many companies match, ~how many people will be sourced, and the estimated Airscale cost before you run.' },
    ],
    steps: [
      'Pick the company filters.',
      'Add job titles / location / keyword (or a persona preset).',
      'Review the scope & cost, then run.',
      'Found people are added, linked to their company, and ready to verify.',
    ],
  },
  '/import': {
    route: '/import', workspace: 'data', title: 'Import — bring in a list',
    intro: 'Upload a CSV of companies or people; the engine cleans it, dedupes it, and adds it to the store.',
    sections: [
      { heading: 'Column matching', body: 'We auto-match your CSV columns to engine fields by header name. Adjust any match, “skip” to ignore a column. Unmapped columns are listed so nothing is silently dropped.' },
      { heading: 'Key fields', body: 'You must map at least one key field (name or domain for companies; email or a name for contacts) so records can be matched and deduped.' },
      { heading: 'Nothing overwritten blindly', body: 'Existing records are updated, not duplicated; existing values are never blanked. Every change records its source.' },
    ],
    steps: [
      'Choose Companies or Contacts, then pick your CSV.',
      'Review/adjust the column matches; ensure a key field is mapped.',
      'Import and watch each row resolve.',
      'See how many were added vs. matched to existing records.',
    ],
  },
  '/companies': {
    route: '/companies', workspace: 'data', title: 'Companies',
    intro: 'Every organization in the store. Filter by type, sub-type, country; search by name or domain. Click a row for detail.',
    sections: [
      { heading: 'Clickable domains', body: 'Domains link straight to the company website so you can verify what an organization is.' },
      { heading: 'Select + enrich', body: 'Tick rows (or select the page) and an action bar appears with a cost preview to enrich the selected companies’ firmographics via Ocean — a controlled, scoped spend rather than the whole database.' },
      { heading: 'Export', body: 'Export the filtered set to CSV. The HubSpot column shows which records are linked.' },
    ],
  },
  '/contacts': {
    route: '/contacts', workspace: 'data', title: 'Contacts',
    intro: 'Every person in the store. Filter by persona or email status; search by name, email, or title.',
    sections: [
      { heading: 'Select + verify', body: 'Tick rows and the action bar lets you verify the selected contacts’ emails via Bouncer, with a cost preview — scoped to your selection, not the whole list.' },
      { heading: 'Email status', body: 'Deliverable (safe), Risky catch-all (cautious), Role-based (ads only), Undeliverable (never). From real verification.' },
    ],
  },
  '/classify': {
    route: '/classify', workspace: 'data', title: 'Classify',
    intro: 'Assign Type & Sub-type to companies missing them, using AI proposals you review — and the approval writes back to HubSpot.',
    sections: [
      { heading: 'Generate proposals', body: 'Run the AI classifier (needs an Anthropic key in Settings, or run it locally for free). It reads each company’s homepage and proposes a Type/Sub-type from the ICP taxonomy. Nothing is applied automatically.' },
      { heading: 'Review & apply', body: 'Each proposal shows the company (with a clickable domain), the proposed Type/Sub-type, a confidence score, and the reasoning. Approve to apply — this writes to the store AND patches HubSpot for linked records.' },
      { heading: 'Confidence filter', body: 'Filter to only high-confidence proposals to review the safe bets first.' },
    ],
    steps: [
      'Click “Run classifier” (or run locally) to generate proposals.',
      'Filter by confidence and review each proposed Type/Sub-type.',
      'Select the good ones and “Approve & apply”.',
      'Applied classifications sync to HubSpot automatically.',
    ],
  },
  '/hygiene': {
    route: '/hygiene', workspace: 'data', title: 'Data Hygiene',
    intro: 'Free, deterministic cleanups on data you already have. Each shows how many records it will affect before you run it; all are labeled Free.',
    sections: [
      { heading: 'Pair Type from Sub-type', body: 'When a company has a Sub-type but no Type, sets the Type from the ICP taxonomy (University → ESO, PE → Investor…) and writes it back to HubSpot. Companies missing both go to Classify.' },
      { heading: 'Repair contact → company links', body: 'Links orphaned contacts to a company by matching their email domain to a company you already have.' },
      { heading: 'Backfill personas', body: 'Tags contacts that have a job title but no persona, using the built-in title classifier.' },
      { heading: 'Normalize country values', body: 'Canonicalizes inconsistent country values (US / USA → United States) so filters are reliable.' },
    ],
  },
  '/runs': {
    route: '/runs', workspace: 'data', title: 'Workflows',
    intro: 'Bulk data operations. Free imports are grouped at the top; paid bulk operations show a real cost estimate before spending.',
    sections: [
      { heading: 'Import from HubSpot (Free)', body: 'Pull all companies/contacts in from HubSpot, deduped. Run a test batch first, then the full import. Run companies before contacts.' },
      { heading: 'Bulk enrichment & verification (Paid)', body: 'Verify all stale emails (Bouncer) or enrich all incomplete companies (Ocean). Each shows the real scoped cost (records × rate). For a precise spend, select rows on Companies/Contacts instead.' },
      { heading: 'Run history & live view', body: 'Every run is logged with a step-by-step breakdown. If the live view disconnects, the run keeps going on the server — check Recent activity for the result.' },
    ],
  },
  '/connectors': {
    route: '/connectors', workspace: 'data', title: 'Connectors',
    intro: 'Connectors now live inside global Settings — visiting Connectors sends you there. Vendor status and credit balances are a section of the Settings page.',
    sections: [
      { heading: 'Where it moved', body: 'Connector status and credit balances are a section of the global Settings page (the ⚙ Settings link pinned at the bottom of the sidebar, in every workspace). The /connectors link redirects there automatically.' },
    ],
  },
  '/connectors/hubspot': {
    route: '/connectors/hubspot', workspace: 'data', title: 'HubSpot connector',
    intro: 'Your system of record. See what’s in the engine vs HubSpot, and push the gap.',
    sections: [
      { heading: 'Engine vs HubSpot', body: 'Coverage bars show how much is linked to a HubSpot record. A callout shows exactly how many companies/contacts here are NOT yet in HubSpot, with a direct “Review & push” button.' },
      { heading: 'Connection health', body: 'Confirms the token is valid and shows a safe fingerprint (never the secret) to catch a wrong/whitespace-corrupted token.' },
    ],
  },
  '/sync': {
    route: '/sync', workspace: 'data', title: 'Push to HubSpot',
    intro: 'Push cleaned company data back to HubSpot. Nothing is written until you review and confirm exactly what changes.',
    sections: [
      { heading: 'Always preview first', body: 'Preview shows how many records will be created vs updated, field by field, without writing anything.' },
      { heading: 'You stay in control', body: 'Only after you confirm does anything change. We fill blanks and correct the taxonomy we own — never erase data already in HubSpot.' },
    ],
    steps: ['Click “Preview changes”.', 'Review the summary + line-by-line list.', 'Confirm to write.', 'Review the result.'],
  },
  '/logs': {
    route: '/logs', workspace: 'data', title: 'Logs & Health',
    intro: 'Check here first when something doesn’t work. Integration status + a feed of recent activity with failures surfaced.',
    sections: [
      { heading: 'Integrations', body: 'Each external tool shows connected or not configured — a missing connection is the usual cause of a feature not working.' },
      { heading: 'Recent activity', body: 'Every workflow run is logged with its result; failures are flagged in red with the error.' },
    ],
  },
  // ---- Email Engine ----
  '/performance': {
    route: '/performance', workspace: 'email', title: 'Email Engine — Performance',
    intro: 'The Email Engine home and scoreboard for the selected workspace. Design, launch, and compare cold-email campaigns (via Email Bison) on top of your clean data.',
    sections: [
      { heading: 'Pick a workspace first', body: 'The Email Engine mirrors Email Bison: one account, a separate workspace per persona (ESOs, Founders, Investors, Providers, Advisors), each with its own API key. The selector at the top of the Email Engine nav sets which workspace you’re in — every page here, and this scoreboard, shows only that workspace’s campaigns. See the “Email Engine workspaces” concept.' },
      { heading: 'The Email Engine workflow', body: 'Within a workspace the engine runs in order: write a Sequence → build a Campaign (attach the sequence, set audience/schedule/senders) → distribute contacts (push one campaign, or run an Experiment across several) → launch → read replies in the Inbox and compare here. See the “Using the Email Engine” concept for the full end-to-end.' },
      { heading: 'Cross-campaign comparison', body: 'Each row is a campaign with its latest open / reply / bounce rates, interested count, and positive replies, side by side. This is where you tell which messaging works for which segment — and, when running an experiment, which arm is winning.' },
      { heading: 'Reading the numbers', body: 'Reply rate and positive replies matter most for cold email; open rate is unreliable (Apple/Google proxies inflate it). Bounce rate should stay under ~2% — if it climbs, your list needs verification (Data Engine) before sending more.' },
      { heading: 'Keeping stats fresh', body: 'Stats are snapshots pulled from Bison. Performance refreshes every campaign’s stats from Bison automatically when you open it (a brief “Updating stats from Bison…” shows while it runs), and a campaign’s detail page refreshes its own stats on open too — so the numbers track what you see in Bison without a manual click. You can still hit Refresh on a campaign for an immediate re-pull. Note opens read 0% when open-tracking is off in Bison — the app shows Bison’s number, it doesn’t estimate. Replies arrive in real time via the Bison webhook (once configured) or on demand from the Inbox.' },
    ],
  },
  '/email/workspaces': {
    route: '/email/workspaces', workspace: 'email', title: 'Workspace settings',
    intro: 'Settings for the workspace you’re currently in: its Email Bison API key and its reply-routing roster. Like the rest of the Email Engine, this page is scoped to the workspace picked in the nav selector — switch workspace there to configure another persona.',
    sections: [
      { heading: 'One key per workspace — no global key', body: 'The Email Engine mirrors Email Bison: one account on one instance (one URL), with a separate workspace per persona (ESOs, Founders, Investors, Providers, Advisors, Community Funding). The workspace is chosen by the API KEY — every workspace’s calls hit the same Bison host, and its own key scopes them to that workspace. There is no global key (no shared sending identity). Get this workspace’s key from Email Bison (switch into the workspace → API), paste it here, Save. A workspace with no key simply can’t send until one is set.' },
      { heading: 'Bison instance URL (one shared setting)', body: 'Because the whole account lives on one Bison instance, the instance URL is a single shared setting, not per workspace — set it once on Settings (“Email Bison instance URL”, e.g. https://send.visitstartupscience.com/api). Every workspace uses that same host; the API key is what scopes calls to the workspace. If sync or the inbox fails with a 500 / “check the key/instance URL”, the base or the key is usually the culprit.' },
      { heading: 'Persona scope & Test connection', body: 'Two extra controls live on the card. (1) Persona scope — a pattern that maps the workspace to a SET of contact personas. Contacts are often tagged granularly (e.g. “ESO Leadership”, “ESO Program”), so the eso workspace scopes to “ESO %” to catch them all; leave it blank to use the workspace’s exact persona. Without this, a push can match 0 contacts. (2) Test connection — hits an authenticated Bison endpoint with this workspace’s key and reports the sender-inbox count and total daily capacity, or surfaces a bad key immediately (a 401 no longer hides as “no senders configured”).' },
      { heading: 'Reading the card', body: 'The card shows whether this workspace has a key (with a masked preview once saved) and a sending light (green = at least one active campaign in Bison, idle = none — a finished/“completed” campaign reads as idle, which is correct). Save replaces the key; Remove deletes it (after which the workspace can’t send until a new key is set).' },
      { heading: 'Reply routing for this workspace', body: 'The card also sets this workspace’s reply-routing roster — the round-robin list of reps that reply alerts cycle through, and optionally its own Google Chat space. There is no global roster; each workspace owns its own. If you set no Chat space here, alerts post to the shared default space (the Google Chat webhook on Settings) — that space is just a notification channel, not a sending identity.' },
      { heading: 'Where the other keys live', body: 'Only this workspace’s Bison key and roster are here. HeyReach, Anthropic, and the shared Google Chat webhook (the default alert space) are on Settings. The master encryption key that protects all stored keys, APP_ENCRYPTION_KEY, is set once in Railway — it can’t live in the app because it’s what secures the app’s own stored keys.' },
    ],
    steps: [
      'Pick the workspace in the Email Engine nav selector (this page shows that one).',
      'In Email Bison, switch into the same workspace → API → copy its key.',
      'Paste the key here and Save — the card flips to “key set”.',
      'Optionally set this workspace’s reply-routing roster (and its own Google Chat space).',
      'Switch workspace in the nav selector and repeat for each persona, then build campaigns/sequences/experiments.',
    ],
  },
  '/campaigns': {
    route: '/campaigns', workspace: 'email', title: 'Campaigns',
    intro: 'Your cold-email campaigns in the selected workspace. Build new ones, or sync existing campaigns from this workspace’s Email Bison to mirror and track them.',
    sections: [
      { heading: 'Scoped to the active workspace', body: 'You only see (and build) campaigns for the workspace selected at the top of the Email Engine nav. Sync pulls from that workspace’s Bison (its own API key); new campaigns are created there. Switch workspace to work on a different persona’s book. If a campaign looks like it belongs to a different persona, it may be a legacy campaign homed to ESOs by the one-time backfill — re-sync inside the correct workspace to re-home it from Bison.' },
      { heading: 'Build vs Sync', body: 'Start a new campaign with the “+ New campaign” button here (it’s a button on this page, not a separate nav tab). Sync from Bison mirrors campaigns you built in Bison so you can monitor them — it needs this workspace’s API key AND the right Bison instance URL (set both on Workspaces); a 500 on Sync almost always means one of those is wrong.' },
      { heading: 'Per campaign', body: 'Open a campaign to push its audience, send a test, launch/pause, and refresh stats.' },
      { heading: 'Experiments', body: 'To run several sequences head-to-head against one audience, use the Experiments tab: it splits the segment across multiple campaigns by weight and pins contacts so you can prune losers and scale winners. See the Experiments guide.' },
    ],
  },
  '/campaigns/new': {
    route: '/campaigns/new', workspace: 'email', title: 'Campaign Builder',
    intro: 'A guided builder: name → audience → schedule → sender inboxes → sequence → create in Email Bison.',
    sections: [
      { heading: 'Audience is deliverability-gated', body: 'The segment count only includes deliverable / risky-catch-all contacts — role-based, undeliverable, and unverified are excluded automatically. Verify and classify contacts in the Data Engine first if the count looks low.' },
      { heading: 'Start from a sequence', body: 'Pick a saved sequence to copy its steps in (editable here without changing the template), or build from scratch. One campaign carries one sequence — that is how Email Bison is structured.' },
      { heading: 'Senders & capacity', body: 'Attach sender inboxes; total daily capacity is inboxes × each inbox’s daily limit. The daily limit lives on the inbox and is POOLED across every campaign that inbox is attached to — attaching the same inbox to many campaigns does not multiply its capacity, it splits it. Make sure capacity covers your audience within warmup limits, or stagger launches. For experiments, give each arm its own inboxes so they don’t compete for one pool.' },
      { heading: 'Copy is formatted for Bison automatically', body: 'On create, the app formats each step for the Bison instance: merge tags are normalized to the single-brace UPPERCASE dialect ({FIRST_NAME}, {COMPANY}…), the body becomes spaced HTML (a visible gap between paragraphs), any sign-off is stripped (Bison injects the signature per inbox), and the first step’s wait is clamped to ≥1 day. You write plain paragraphs; the send-ready shape is handled for you.' },
      { heading: 'Create ≠ launch', body: 'Creating sets up the campaign + sequence + schedule in Bison and sends nothing. You then push the audience and launch from the campaign page.' },
      { heading: 'Testing several sequences? Use an experiment', body: 'If this campaign is one arm of a head-to-head test, build all the arm campaigns here, then go to the Experiments tab and let the experiment distribute contacts. Do NOT push the audience from each campaign page in that case — the experiment splits and pins contacts so the comparison stays even.' },
    ],
    steps: [
      'Name the campaign (match the sequence so it’s easy to find later).',
      'Set the audience (persona / sub-type) — the count shows deliverable contacts only.',
      'Set the sending schedule (days, times, timezone) and attach sender inboxes.',
      'Attach a saved sequence (or build steps from scratch).',
      'Create the campaign in Bison. Then push the audience + launch from the campaign page — unless it’s an experiment arm, in which case distribute from the experiment instead.',
    ],
  },
  '/sequences': {
    route: '/sequences', workspace: 'email', title: 'Sequences',
    intro: 'Reusable message sequences for the selected workspace — build once, attach to any campaign in that workspace, A/B test messaging across segments.',
    sections: [
      { heading: 'Scoped to the workspace', body: 'The library shows the sequences for the active workspace (the persona you picked at the top of the Email Engine nav). Each workspace keeps its own sequences; switch workspace to see another persona’s library.' },
      { heading: 'Copy-on-attach', body: 'Attaching a sequence to a campaign copies its steps; editing the campaign’s copy never changes the template.' },
      { heading: 'Steps', body: 'Each step has a subject, a body, and a wait. Merge tags are single-brace UPPERCASE — {FIRST_NAME}, {COMPANY}, {TITLE}, {LAST_NAME} — matching what this Bison instance renders; the app converts bodies to spaced HTML at send time, so write plain short paragraphs separated by blank lines. Don’t add a sign-off: Bison injects the sender’s signature per inbox. (Note: per-step subject A/B variants are not offered — this Bison version has no variant mechanism; test subjects at the sequence level via Experiments instead.)' },
      { heading: 'Write with AI (new sequences)', body: 'Creating a new sequence opens with a “Write with AI” panel: pick a cold-email style and a persona and Claude drafts the whole sequence in Greg’s voice. See the sequence builder guide.' },
      { heading: 'Rewrite with AI (editing)', body: 'When you open an existing sequence, the screen is steps-first — no from-scratch setup. Each step has inline ✨ Rewrite actions (Tighten, Shorten, Punch up subject, More Greg, or a custom instruction), and a collapsed “↻ Rewrite with AI” panel can regenerate the whole sequence from the inputs it was originally built with.' },
      { heading: 'Filter the library', body: 'AI-generated sequences remember the inputs that produced them. Use the filter bar to narrow the library by style, persona, the specific pain/angle, and whether it leads with an offer — so you can find “ESO · pain-centric · weak post-program outcomes” instantly. The filters only list values that actually exist in your library (so the persona list grows as you add sequences for new personas), and the pain/angle list narrows to the selected persona’s pains.' },
      { heading: 'Reading a card', body: 'Each card is built to scan top to bottom: a persona pill (filled) and a style pill (tinted) on the first line, then the sequence name, then the first email’s SUBJECT line (the hook the reader sees), then the pain/angle and the named lead-magnet offer (if any), and a footer with the step count and sender mode (From Greg / Edify Greg). Long pain labels and offer names truncate with “…” and show the full text on hover.' },
    ],
  },
  '/sequences/new': {
    route: '/sequences/new', workspace: 'email', title: 'Sequence Builder (with AI writer)',
    intro: 'Build a reusable cold-email sequence — by hand, or let Claude draft it for you from a proven style and a persona, in Gregory Shepard’s voice.',
    sections: [
      { heading: 'Write with AI', body: 'Pick a STYLE (the strategy — e.g. Pain-centric, Offer-centric, Three-Paragraph) and a PERSONA (e.g. ESOs, Investors, Founders). The style sets how many emails there are and what each does; Claude writes the copy following Greg’s voice rules and an anti-AI-writing rulebook.' },
      { heading: 'Target a specific pain', body: 'For pain-driven styles (Pain, Insight, Benchmark, Trigger), a “Specific pain / angle” picker appears once you choose a persona. Pick one of that persona’s named pains (e.g. ESO → “weak outcomes after Demo Day”) to make it the through-line, write your own, or let AI use the persona’s general pain. The choice is saved so you can filter the library by it later.' },
      { heading: 'Sender & edification', body: 'If the sending inbox is Greg, check “This inbox is Greg” for first-person copy. Otherwise the email is written as the sender and edifies Greg, since every demo is with Greg personally.' },
      { heading: 'Offers', body: 'Offer-centric styles can lead with one of our lead magnets (pick one or let AI choose the best fit for the persona). To test subject lines, generate two sequences and run them as separate arms of an Experiment — this Bison instance has no in-step A/B variant mechanism, so there is no per-step variant toggle.' },
      { heading: 'Edit before saving', body: 'Generated steps land in the editable Steps editor — review, tweak, and adjust waits, then save. The inputs that produced the sequence (style, persona, pain, offer) are saved with it and shown under “Generated from”. Generating costs one Opus call (“Paid”); editing and saving are free. Saved templates work exactly like hand-built ones (copy-on-attach to a campaign).' },
    ],
    steps: [
      'Open “Write with AI” and choose a style card.',
      'Choose the persona you’re writing to (its pain/value shows as a hint).',
      'For pain-driven styles, pick the specific pain/angle to lead with (or let AI choose).',
      'For offer styles, pick a lead magnet or let AI choose.',
      'Set the sender (or check “This inbox is Greg”).',
      'Click Generate, review the steps below, edit anything, then Save.',
    ],
  },
  '/experiments': {
    route: '/experiments', workspace: 'email', title: 'Experiments (variation testing)',
    intro: 'Test several different messages against ONE audience at the same time, fairly, and see which one wins. Split evenly or by weight, then prune losers / scale winners without reshuffling anyone already in flight.',
    sections: [
      { heading: 'What an experiment is (the horse race)', body: 'An experiment lets you race several messages against the same audience so you can tell which actually wins. The AUDIENCE is the workspace’s persona segment (e.g. all deliverable Founders) — the experiment owns that batch. An ARM is one horse: one campaign (which carries one sequence — one set of emails) plus a weight. You add an arm per message you want to test, push, then compare the arms.' },
      { heading: 'Weight = share of new contacts', body: 'Each arm’s weight is how big a slice of NEW contacts it gets. All weights equal = even split. Weight 2 vs 1 = roughly twice as many. Weight 0 = paused: it gets no new contacts but keeps the ones already assigned to it.' },
      { heading: 'Why pinning matters', body: 'When you push, the engine takes everyone in the segment not yet assigned and drops each contact into exactly one arm, then PINS them there permanently. It’s deterministic (no coin flip — the same contact always lands in the same arm), which gives you two guarantees: re-running the push only sends NEW contacts (nobody already in flight is reshuffled or emailed twice), and changing a weight only changes where FUTURE contacts go (people already pinned stay put). That’s what keeps the A/B comparison clean while it’s running.' },
      { heading: 'Scoped to the workspace — your iterate loop', body: 'An experiment belongs to the active workspace and draws from that workspace’s persona segment. This is the “prepare a big batch for a persona, test several messages, then add more and iterate” loop: push to allocate the current eligible contacts across arms; read Performance; set losers to weight 0 and raise winners (and/or add a new arm with a fresh sequence); enrich more contacts for the persona and push again — only the new ones flow, mostly to the winners.' },
      { heading: 'Build from sequences (one step)', body: 'The fastest way to stand up a head-to-head: “+ Build from sequences” on the Experiments page. Pick a sequence per arm, set weights, and partition sender inboxes across arms; the app creates one Bison campaign per sequence (formatting copy + schedule + senders for you) and wires the experiment in a single action — ready to preview and push. The older “Wire from existing campaigns” flow is still there if you already built the campaigns.' },
      { heading: 'Preview before you push', body: 'Open an experiment and the preview shows the segment size and exactly how many NEW contacts would flow to each arm right now, plus how many are already assigned/pushed per arm. It also runs pre-flight checks: total daily send capacity (sender inboxes × their daily limits), a warning when arms SHARE sender inboxes (the quota is pooled and per-arm isolation breaks — partition them), how many contacts are missing a company ({COMPANY} would render blank), how many are already in another campaign (and will be excluded — see below), and any merge tags the push can’t fill. Push is confirm-gated and streams progress; each arm’s contacts go to that arm’s own Bison campaign.' },
      { heading: 'No double-emailing (cross-campaign dedup)', body: 'Before pushing, the engine reads who is already a lead in the workspace’s OTHER campaigns and subtracts those emails from the segment, so nobody in flight elsewhere gets a second concurrent sequence (and someone who already replied isn’t re-cold-emailed). The arms of THIS experiment don’t suppress each other. The push log reports how many were excluded.' },
      { heading: 'Compare on Performance', body: 'Each arm is its own Bison campaign, so the Performance page compares them side by side. Judge on positive replies, not opens.' },
      { heading: 'The “link sequence” dropdown is provenance only', body: 'In the create form, the optional per-arm “link sequence” picker just records WHICH library sequence an arm represents (for your reference and the arm label). The emails that actually send come from the CAMPAIGN you pick for the arm (its copied-in steps) — not from this dropdown. So make sure each arm’s campaign carries the sequence you mean to test.' },
    ],
    steps: [
      'Fastest: Experiments → “+ Build from sequences”. Pick a sequence per arm, set weights, and partition sender inboxes across arms — the app creates a campaign per sequence and wires the experiment in one step. (Or use “Wire from existing campaigns” if you already built them.)',
      'Open the experiment and read the preview: segment size, new contacts per arm, total daily capacity, and any warnings (shared senders, blank tags, already-enrolled contacts).',
      'Distribute & push (confirm-gated): contacts are split, pinned, and sent to each arm’s campaign. Anyone already in another campaign is excluded automatically.',
      'Watch Performance. Set losers to weight 0 and raise winners (or add a new arm), then add more contacts for the persona and push again — only the new contacts flow, by the new weights.',
    ],
  },
  '/inbox': {
    route: '/inbox', workspace: 'email', title: 'Inbox',
    intro: 'Replies from the selected workspace’s campaigns, with positive/interested replies surfaced first so you can claim and respond fast.',
    sections: [
      { heading: 'Scoped to the workspace', body: 'The inbox (and the nav badge) shows replies for the active workspace only, pulled from that workspace’s Bison. Switch workspace to triage another persona’s replies.' },
      { heading: 'How replies arrive', body: 'In real time via the Email Bison webhook (once BISON_WEBHOOK_SECRET is configured), or on demand with “Sync replies”. Sync pulls this workspace’s FULL reply history from Bison (paging through all pages), deduping by reply id, so it backfills past replies as well as recent ones — run it once after connecting a workspace. It needs the workspace’s API key and the correct Bison instance URL (set on Workspaces); if Sync returns nothing, check those first. (Automatic HubSpot promotion on reply is built but currently held back until the CRM objects are finalized.) The nav badge counts unread positive replies so you never miss a warm one.' },
      { heading: 'AI triage (what gets to the leads channel)', body: 'Every new reply is read by an AI triage step before any alert is sent. A genuine human reply (interested, an objection, a question, a referral) posts a Google Chat alert that round-robins to the next rep and deep-links here — and the alert now carries a one-sentence 💡 suggested strategy for how to respond. A no-action reply (a bare out-of-office, an unsubscribe, a bounce) is suppressed from the leads channel entirely so the channel stays signal — it still lands here in the Inbox, just doesn’t put a rep on the clock. The suggested strategy and the triage category also show on the reply card here. If the Anthropic key isn’t set, triage is skipped and replies notify as before.' },
      { heading: '“Positive only” (on by default)', body: 'The Inbox defaults to showing only actionable replies. Auto-replies, out-of-office, “no longer monitored”, and bounces are hidden — when they’re hidden the page shows a count (“N auto-replies hidden”) with a “Show all replies” link, so an actionable-only list never reads as a broken or empty inbox. Untick “Positive only” to see every reply, including the auto ones.' },
      { heading: 'Referral capture (“contact someone else instead”)', body: 'When a reply points you to a different person — an out-of-office naming a colleague, or “I’ve left, email X” — triage reads the body, picks out THAT person’s email (not the sender’s own address or signature noise), and auto-creates them as a lead in this workspace’s Bison. It does NOT add them to the campaign on its own. Instead the reply card shows a “Referral captured” box: confirm “Add to campaign” to enroll the new lead into the same campaign the reply came from, or Dismiss it. The box flags when the name was inferred from the email and whether the new address is on the same company domain — sanity-check a different-domain referral before adding. This manual gate means a mis-parsed address never gets cold-emailed by accident.' },
      { heading: 'Claim it', body: 'Click “Claim & reply” to take ownership — this prevents two reps from working the same lead. The round-robin’s assigned rep shows next to each reply until it’s claimed.' },
      { heading: 'Reply in-app (through Bison)', body: 'After claiming, write your reply right here. It’s sent through Email Bison from a chosen sender inbox (defaulting to the one the original was sent from), threaded on the original conversation — so you never need the rotating sender mailbox yourself. Pick a different “Reply from” inbox if you want. If a reply has no Bison thread id, open it in the Bison master inbox to respond instead.' },
      { heading: 'Closing the loop', body: 'Mark a reply interested (also flags the lead in Bison) or handled to clear it from the queue. Interested replies are the signal the whole engine optimizes for: when comparing campaigns or experiment arms on Performance, positive replies — not opens — are how you judge which sequence is winning.' },
    ],
  },
  // ---- LinkedIn Engine ----
  '/linkedin': {
    route: '/linkedin', workspace: 'linkedin', title: 'LinkedIn Engine — Overview',
    intro: 'LinkedIn outreach via HeyReach. Campaigns are built in HeyReach; here you mirror them, push clean LinkedIn segments, and track replies.',
    sections: [
      { heading: 'Turning it on', body: 'Add a HeyReach API key in Settings (takes effect immediately, no redeploy). Until then the engine shows a clear setup state.' },
      { heading: 'What it does', body: 'Sync + push + monitor — HeyReach has no API campaign creation, so you build the campaign + sequence in HeyReach and operate it from here.' },
    ],
  },
  '/linkedin/campaigns': {
    route: '/linkedin/campaigns', workspace: 'linkedin', title: 'LinkedIn Campaigns',
    intro: 'Campaigns mirrored from HeyReach. Push a LinkedIn-ready segment into an active campaign; pause/resume.',
    sections: [
      { heading: 'LinkedIn segment', body: 'Pushes contacts that have a LinkedIn profile URL (email not required). Filter by persona.' },
      { heading: 'Active campaigns only', body: 'HeyReach only accepts leads into an active campaign.' },
    ],
  },
  '/linkedin/inbox': {
    route: '/linkedin/inbox', workspace: 'linkedin', title: 'LinkedIn Inbox',
    intro: 'Conversations from your HeyReach campaigns. Open a thread in LinkedIn to respond.',
    sections: [
      { heading: 'Sync conversations', body: 'Pull the latest replies from HeyReach; positive ones surface first with a nav badge.' },
    ],
  },
  '/settings': {
    route: '/settings', workspace: 'data', title: 'Settings',
    intro: 'The one global settings panel for the whole GTM system — shared across the Data, Email, and LinkedIn engines. Reached from the ⚙ Settings link pinned at the bottom of the sidebar in every workspace. Holds everything account-wide; per-workspace Email settings live with the Email Engine.',
    sections: [
      { heading: 'Connectors (= keys)', body: 'A connector and its API key are one thing, shown once: each external system is a row with a status dot, its masked key, and an inline Edit/Add-key control — so a broken connector is fixed right where it’s shown. Covers HubSpot, HeyReach, Anthropic, Ocean.io, Bouncer, Airscale, the default Google Chat space, and the Email Bison instance URL. Email Bison is the exception — it has no global key (each workspace authenticates as itself), so its row links to Workspaces.' },
      { heading: 'How keys resolve', body: 'A key set here is used first; otherwise the Railway env var. Storing keys in-app requires APP_ENCRYPTION_KEY set once in Railway — until then the controls are disabled and keys come from env vars.' },
      { heading: 'Anthropic', body: 'One key powers all AI: the company classifier (Classify), the cold-email sequence writer, and reply triage (reads each reply, suggests a strategy, extracts referral contacts).' },
      { heading: 'Credit balances', body: 'Metered vendors (Ocean, Bouncer, Airscale) show their live balance with a what-it-buys breakdown and a last-updated time. Hit Refresh to re-fetch.' },
      { heading: 'Per-workspace settings', body: 'Each Email persona workspace’s Bison key, persona scope, and reply-routing roster are per-workspace, so they live on Email Engine → Workspaces, not here.' },
    ],
  },
};

/** Resolve the best help entry for a path (exact, then prefix for detail routes). */
export function helpForPath(pathname: string): KbPage {
  if (PAGES[pathname]) return PAGES[pathname];
  // Detail routes (e.g. /companies/123, /campaigns/45) fall back to their list page.
  const prefixes = Object.keys(PAGES).filter((p) => p !== '/').sort((a, b) => b.length - a.length);
  const hit = prefixes.find((p) => pathname.startsWith(p));
  return hit ? PAGES[hit] : GENERAL;
}

// ---------------------------------------------------------------- KB articles (one page each)
/**
 * The KB renders as an index + one page per ARTICLE. Articles come from three groups:
 *   • "getting-started" — the GENERAL overview
 *   • "concepts"        — each CORE CONCEPT becomes its own article
 *   • the page guides   — each PAGES entry becomes an article (linked to its live route)
 */
export type KbCategory = 'getting-started' | 'concepts' | 'data' | 'email' | 'linkedin';

export interface KbArticle {
  slug: string;
  category: KbCategory;
  title: string;
  summary: string;          // one-line teaser for the index
  intro: string;
  sections: KbSection[];
  steps?: string[];
  appRoute?: string;        // the live page this documents (for a "Go to" link)
}

export const CATEGORY_LABELS: Record<KbCategory, string> = {
  'getting-started': 'Getting started',
  concepts: 'Core concepts',
  data: 'Data Engine',
  email: 'Email Engine',
  linkedin: 'LinkedIn Engine',
};
export const CATEGORY_ORDER: KbCategory[] = ['getting-started', 'concepts', 'data', 'email', 'linkedin'];

const slugify = (s: string) =>
  s.toLowerCase().replace(/[()]/g, '').replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/** Build the full, de-duplicated article list. */
export function kbArticles(): KbArticle[] {
  const out: KbArticle[] = [];

  // Getting started — the overview.
  out.push({
    slug: 'overview', category: 'getting-started', title: GENERAL.title,
    summary: 'The big picture: three workspaces on one clean dataset.',
    intro: GENERAL.intro, sections: GENERAL.sections,
  });

  // Concepts — one article each.
  for (const c of CONCEPTS) {
    out.push({
      slug: slugify(c.heading), category: 'concepts', title: c.heading,
      summary: c.body.length > 120 ? c.body.slice(0, 117) + '…' : c.body,
      intro: c.body, sections: [],
    });
  }

  // Page guides — one article per route (deduped).
  const seen = new Set<string>();
  for (const p of Object.values(PAGES)) {
    if (seen.has(p.route)) continue;
    seen.add(p.route);
    out.push({
      slug: slugify(p.title), category: p.workspace === 'general' ? 'data' : p.workspace,
      title: p.title, summary: p.intro.length > 120 ? p.intro.slice(0, 117) + '…' : p.intro,
      intro: p.intro, sections: p.sections, steps: p.steps,
      appRoute: p.route.startsWith('/') ? p.route : undefined,
    });
  }
  return out;
}

/** Articles grouped by category (in display order), for the KB index. */
export function kbArticlesByCategory(): { category: KbCategory; label: string; articles: KbArticle[] }[] {
  const all = kbArticles();
  return CATEGORY_ORDER
    .map((category) => ({ category, label: CATEGORY_LABELS[category], articles: all.filter((a) => a.category === category) }))
    .filter((g) => g.articles.length > 0);
}

export function kbArticleBySlug(slug: string): KbArticle | undefined {
  return kbArticles().find((a) => a.slug === slug);
}

/** The KB article slug that documents a given app route (for "read more" deep-links). */
export function slugForRoute(pathname: string): string {
  return slugify(helpForPath(pathname).title);
}
