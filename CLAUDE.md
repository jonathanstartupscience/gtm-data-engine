# GTM Data Engine — agent guide

Reusable RevOps platform for the GTM team. Three workspaces on one clean dataset:
**Data Engine** (CRM/warehouse), **Email Engine** (Email Bison), **LinkedIn Engine** (HeyReach).
Node/TypeScript · Express · Drizzle + Postgres (Railway) · React 18 + Vite · Clerk auth.
Live at **gtm.startupscience.io** (Railway auto-deploys from `main`; `start:prod` runs `db:migrate`).

---

## 🔴 RULE: Keep the knowledge base current (every feature ships with its docs)

The in-app help is driven by a **single source of truth**:
[`web/src/help/knowledgeBase.ts`](web/src/help/knowledgeBase.ts). Everything renders from it:
the contextual **Help drawer** ("Help for this page" button), the **Knowledge Base index** (`/help`,
prominent green nav button), and a **dedicated article page per topic** (`/help/:slug` — concepts and
each page guide become their own article via `kbArticles()`). Add content once, it appears everywhere.

**Whenever you add or change a feature, update the KB in the SAME change — no exceptions:**

| You did this | Then you MUST |
| --- | --- |
| Added a new **page/route** | Add a `PAGES['<route>']` entry (route, workspace, title, intro, sections, optional steps). Add the route to its workspace in [`WorkspaceSwitcher.tsx`](web/src/components/WorkspaceSwitcher.tsx). |
| Changed how a page **behaves** | Fix that page's KB entry so the wording matches what the app now does. |
| Added/changed a **cross-cutting concept** (taxonomy, personas, credit safety, a new vendor, dedupe rules…) | Add or update a `CONCEPTS` entry and the `GENERAL` overview if needed. |
| Added a **vendor/connector** | Update the Connectors list, the `CONCEPTS` "Connecting tools" entry, and the relevant page entry. |

Then bump `Last reviewed:` at the top of `knowledgeBase.ts`. **A stale KB is a bug — treat it like one.**
A change that touches the UI but not the KB is incomplete. The KB is plain data (no JSX), so edits are cheap.

Sanity check before committing UI work: does every route in `main.tsx` have a `PAGES` entry? (Detail
routes like `/companies/:id` fall back to their list page via `helpForPath` — that's fine.)

---

## Architecture orientation

- **Canonical store** (`src/db/schema.ts`, `src/engine/resolve.ts`): golden companies/contacts, matched on
  domain/email/linkedin/name+domain. `resolve.ts` fills gaps, never blanks; logs field history **only on change**.
- **ICP taxonomy** (`src/engine/icp-taxonomy.ts`): the source-of-truth Type→Sub-type framework. Drives
  classification, the pairing hygiene task, and pickers. Store persists HubSpot internal type values
  (CUSTOMER=ESO) — translate at the boundary via `src/engine/taxonomy.ts` (`typeValue`/`typeLabel`).
- **Secrets** (`src/lib/secrets.ts`): vendor keys resolve **DB-first** (in-app Settings, AES-256-GCM via
  `APP_ENCRYPTION_KEY`) then env. Set keys in the app under Settings, no redeploy.
- **Adapters** (`src/engine/adapters/`): hubspot, emailbison, heyreach, ocean, bouncer, airscale, anthropic.
- **Recipes** (`src/engine/recipes.ts`) compose stages; runs are recorded with a step waterfall.
- **SSE** for long ops; runs survive a dropped browser stream (they continue server-side).
- **Credit safety**: anything spending a vendor shows a cost preview; prefer scoped row-selection
  (Companies/Contacts action bar) over whole-DB bulk. Free deterministic cleanups are labeled "Free".
- **Reactive counts**: dropdown taxonomy/facet counts come from [`useTaxonomy`](web/src/hooks/useTaxonomy.ts);
  call `refreshTaxonomy()` after any op that changes type/sub-type/persona/country distribution.
- **Email Engine (cold email)**: sequences → campaigns → experiments → inbox. Write sequences by hand or
  with the AI writer (`src/engine/email/` IP: styles/personas/voice/lead-magnets; Opus via `anthropic.ts`).
  The from-scratch writer (`SequenceGenerator`) shows on **new** sequences only; **editing** is steps-first
  with per-step rewrites (`stages/rewrite-step.ts` → `/sequences/rewrite-step`) + whole-sequence regenerate
  (`SequenceRewriter`). Rewrites preserve merge tags and add no sign-off (Bison injects it per sender).
  A **campaign carries one sequence**; an **experiment** (`src/engine/experiments/allocate.ts`,
  `stages/experiment.ts`) runs many head-to-head by deterministically splitting + **pinning** contacts
  across arms (weights; 0 = pause). To populate the library from Claude Code, generate via the
  **`cold-email-sequence` skill** then bulk-load with `npm run seed:sequences` (auth via `API_SERVICE_TOKEN`).
  The skill's SKILL.md has the full agent workflow; the in-app KB ("Using the Email Engine") is the user view.

## Conventions

- Migrations: `npm run db:generate` after a schema change, commit the `drizzle/` SQL. Never hand-edit applied migrations.
- Typecheck both sides before committing: `npx tsc --noEmit` in root **and** in `web/`. Build: `npm --prefix web run build`.
- Pages render help from the KB; cost labels use the shared `CostBadge`; multi-value inputs use `ChipInput`.
- Don't commit scratch files (`_*.ts`, `_*.mjs` are gitignored).

## Pending env vars (set in Railway when enabling features)
`APP_ENCRYPTION_KEY` (in-app key storage) · `ANTHROPIC_API_KEY` (in-app classifier + AI sequence writer; or set via Settings) ·
`BISON_WEBHOOK_SECRET` (auto reply capture) · `HEYREACH_API_KEY` (via Settings) · Postgres volume bump (full HubSpot re-pull) ·
`API_SERVICE_TOKEN` (optional, env-only, >=24 chars) — a high-privilege shared secret that authenticates
headless API callers (Claude Code, scripts, CI) via `Authorization: Bearer` or `X-Service-Token`, bypassing
Clerk. Additive: never weakens browser auth. Powers `npm run seed:sequences` (bulk-load the sequence library
through the real API). Keep it out of the DB secret layer — it is the credential that *grants* API access.
