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
 * Last reviewed: 2026-06-23 (added AI sequence writer + variation-testing experiments).
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
  { heading: 'Connecting tools (Settings)', body: 'Vendor API keys can be set in-app under Settings (encrypted, no redeploy) or as Railway env vars. The Connectors page shows what’s connected and live credit balances for metered vendors. The Anthropic key powers two things: the in-app classifier (on the fast, cheap Claude Haiku model) and the AI cold-email sequence writer (on Claude Opus, the strongest model, for copy quality).' },
  { heading: 'Variation testing (experiments)', body: 'An experiment runs several sequences head-to-head against one audience. Each "arm" is a campaign plus a weight. When you push, the engine splits the deliverable segment across the arms deterministically (equal weights = even split; higher weight = a bigger share of NEW contacts) and PINS each contact to its arm. Pinning is the important part: a contact never moves arms, so re-running only flows newly added contacts, and changing weights only changes where future contacts go. To prune a loser, set its weight to 0 (it keeps the leads it already has, gets no new ones); to scale a winner, raise its weight; to try a new idea, add an arm. Because each arm is its own Bison campaign, the Performance page compares them directly. Build it at Email Engine → Campaigns → A/B experiments.' },
  { heading: 'Cold email styles & the AI sequence writer', body: 'The Email Engine can draft a whole cold-email sequence for you. You pick a STYLE (a proven strategic skeleton — Three-Paragraph / Khare, Pain-centric, Offer-centric, Authority, Insight, Relevance/Trigger, plus newer ones like Curiosity, Compliment, Question, Benchmark, and Peer/FOMO) and a PERSONA (Founders, ESOs, Universities, Investors, Providers, Chambers, Government, Mentors, Partners — each with its own pain and value). The style fixes how many emails there are and what each one does; Claude writes the actual copy in Gregory Shepard’s voice, following a strict anti-AI-writing rulebook (no em dashes, no buzzwords, no filler). For pain-driven styles you can also target a SPECIFIC named pain for that persona (e.g. ESO → “weak outcomes after Demo Day”) or write your own. Offer styles can lead with one of our lead magnets (the Greg-authored guides/playbooks/audits). If the sending inbox is Greg, it writes in his first person; otherwise it writes as the sender and edifies Greg, since every demo is with Greg personally. Copy uses Bison merge tags ({{first_name}}, {{company}}, {{title}}, and for some styles {{trigger}}, {{magnet_link}}, {{sender_linkedin}}), so one sequence personalizes itself across the whole segment at send time. You can optionally generate an A/B variant of the first step. Generated copy lands in the editable Steps editor — review and edit before saving. The inputs that produced each sequence (style, persona, pain, offer) are saved with the template, shown as chips in the library, and filterable from the Sequences filter bar. Generating costs one Opus call (labeled “Paid”); editing and saving are free.' },
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
    intro: 'The external systems wired into the engine — what each does, whether it’s connected, and live credit balances.',
    sections: [
      { heading: 'Status', body: 'Each tool (HubSpot, Email Bison, HeyReach, Ocean, Bouncer, Airscale, Anthropic) shows connected or not. Keys can be set in Settings or in Railway.' },
      { heading: 'Credit balances', body: 'Metered vendors show their live balance translated into a relatable metric (e.g. “20,000 Ocean credits ≈ 800 lookalike searches”).' },
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
    intro: 'The Email Engine home. Design, launch, and compare cold-email campaigns (via Email Bison) on top of your clean data.',
    sections: [
      { heading: 'Cross-campaign comparison', body: 'Open/reply/bounce rates, positive replies, and interested counts side by side, so you can tell which messaging works for which segment.' },
      { heading: 'Getting started', body: 'Build a campaign, manage reusable sequences, or open the inbox from the quick actions. Refresh a campaign’s stats from its detail page.' },
    ],
  },
  '/campaigns': {
    route: '/campaigns', workspace: 'email', title: 'Campaigns',
    intro: 'Your cold-email campaigns. Build new ones, or sync existing campaigns from Email Bison to mirror and track them.',
    sections: [
      { heading: 'Build vs Sync', body: 'Build creates a campaign + sequence + schedule in Bison from here. Sync mirrors campaigns you built in Bison so you can monitor them.' },
      { heading: 'Per campaign', body: 'Open a campaign to push its audience, send a test, launch/pause, and refresh stats.' },
      { heading: 'A/B experiments', body: 'To run several sequences head-to-head against one audience, use “A/B experiments”: it splits the segment across multiple campaigns by weight and pins contacts so you can prune losers and scale winners. See the Experiments guide.' },
    ],
  },
  '/campaigns/new': {
    route: '/campaigns/new', workspace: 'email', title: 'Campaign Builder',
    intro: 'A guided builder: name → audience → schedule → sender inboxes → sequence → create in Email Bison.',
    sections: [
      { heading: 'Audience is deliverability-gated', body: 'The segment count only includes deliverable / risky-catch-all contacts — role-based, undeliverable, and unverified are excluded automatically.' },
      { heading: 'Start from a sequence', body: 'Pick a saved sequence to copy its steps in (editable without changing the template), or build from scratch.' },
      { heading: 'Create ≠ launch', body: 'Creating sets up the campaign in Bison; you push the audience and launch from the campaign page.' },
    ],
  },
  '/sequences': {
    route: '/sequences', workspace: 'email', title: 'Sequences',
    intro: 'Reusable message sequences you build once and attach to any campaign — for A/B testing messaging across segments.',
    sections: [
      { heading: 'Copy-on-attach', body: 'Attaching a sequence to a campaign copies its steps; editing the campaign’s copy never changes the template.' },
      { heading: 'Steps', body: 'Each step has a subject, body (with {{variables}}), a wait, and an optional A/B variant.' },
      { heading: 'Write with AI', body: 'New and edit sequences both have a “Write with AI” panel: pick a cold-email style and a persona and Claude drafts the whole sequence in Greg’s voice. See the sequence builder guide.' },
      { heading: 'Filter the library', body: 'AI-generated sequences remember the inputs that produced them. Use the filter bar to narrow the library by style, persona, the specific pain/angle, and whether it leads with an offer — so you can find “ESO · pain-centric · weak post-program outcomes” instantly. Each card shows its inputs as chips; the filters only list values that actually exist in your library.' },
    ],
  },
  '/sequences/new': {
    route: '/sequences/new', workspace: 'email', title: 'Sequence Builder (with AI writer)',
    intro: 'Build a reusable cold-email sequence — by hand, or let Claude draft it for you from a proven style and a persona, in Gregory Shepard’s voice.',
    sections: [
      { heading: 'Write with AI', body: 'Pick a STYLE (the strategy — e.g. Pain-centric, Offer-centric, Three-Paragraph) and a PERSONA (e.g. ESOs, Investors, Founders). The style sets how many emails there are and what each does; Claude writes the copy following Greg’s voice rules and an anti-AI-writing rulebook.' },
      { heading: 'Target a specific pain', body: 'For pain-driven styles (Pain, Insight, Benchmark, Trigger), a “Specific pain / angle” picker appears once you choose a persona. Pick one of that persona’s named pains (e.g. ESO → “weak outcomes after Demo Day”) to make it the through-line, write your own, or let AI use the persona’s general pain. The choice is saved so you can filter the library by it later.' },
      { heading: 'Sender & edification', body: 'If the sending inbox is Greg, check “This inbox is Greg” for first-person copy. Otherwise the email is written as the sender and edifies Greg, since every demo is with Greg personally.' },
      { heading: 'Offers & A/B', body: 'Offer-centric styles can lead with one of our lead magnets (pick one or let AI choose the best fit for the persona). Toggle “A/B variant” to also generate an alternate first step.' },
      { heading: 'Edit before saving', body: 'Generated steps land in the editable Steps editor — review, tweak, and adjust waits, then save. The inputs that produced the sequence (style, persona, pain, offer) are saved with it and shown under “Generated from”. Generating costs one Opus call (“Paid”); editing and saving are free. Saved templates work exactly like hand-built ones (copy-on-attach to a campaign).' },
    ],
    steps: [
      'Open “Write with AI” and choose a style card.',
      'Choose the persona you’re writing to (its pain/value shows as a hint).',
      'For pain-driven styles, pick the specific pain/angle to lead with (or let AI choose).',
      'For offer styles, pick a lead magnet or let AI choose.',
      'Set the sender (or check “This inbox is Greg”), optionally turn on the A/B variant.',
      'Click Generate, review the steps below, edit anything, then Save.',
    ],
  },
  '/experiments': {
    route: '/experiments', workspace: 'email', title: 'Experiments (variation testing)',
    intro: 'Run multiple sequences head-to-head against one audience, split evenly or by weight, and prune losers / scale winners without reshuffling anyone already in flight.',
    sections: [
      { heading: 'Arms = campaigns + weights', body: 'Each arm is one campaign (which carries one sequence) plus a weight. Equal weights split new contacts evenly; a higher weight takes a larger share of new traffic; weight 0 pauses an arm.' },
      { heading: 'Pinned, stable assignment', body: 'Contacts are assigned to an arm once and pinned there. Re-running the push only distributes newly added contacts, and changing weights only affects future traffic — so a running comparison is never corrupted.' },
      { heading: 'Prune & scale', body: 'Set a weak arm’s weight to 0 to stop new traffic (it keeps its existing leads); raise a strong arm’s weight to send it more; add a new arm anytime to test a fresh iteration. Compare arms on the Performance page.' },
    ],
    steps: [
      'Build one campaign per sequence you want to test (Campaigns → New campaign, attach the sequence).',
      'Campaigns → A/B experiments → New experiment: name it, pick the audience (persona/sub-type), add an arm per campaign with a weight.',
      'Open the experiment, check the preview (how many new contacts flow to each arm), then Distribute & push.',
      'Watch results in Performance; set losers to weight 0 and raise winners, then push again to flow new contacts by the new weights.',
    ],
  },
  '/inbox': {
    route: '/inbox', workspace: 'email', title: 'Inbox',
    intro: 'Replies from your campaigns, with positive/interested replies surfaced first so you can respond fast.',
    sections: [
      { heading: 'How replies arrive', body: 'In real time via the Email Bison webhook (once configured), or on demand with “Sync replies”. The nav badge counts unread positive replies.' },
      { heading: 'Actions', body: 'Reply by email, mark a reply interested, or mark it handled.' },
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
    route: '/settings', workspace: 'linkedin', title: 'Settings',
    intro: 'Manage vendor API keys at runtime — set or rotate them without touching Railway. Keys are encrypted and shown only masked.',
    sections: [
      { heading: 'How keys resolve', body: 'A key set here is used first; otherwise the Railway env var is used. So existing keys keep working and anything set here overrides them.' },
      { heading: 'Prerequisite', body: 'Storing keys in-app requires APP_ENCRYPTION_KEY set once in Railway. Until then the fields are disabled and keys come from env vars.' },
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
