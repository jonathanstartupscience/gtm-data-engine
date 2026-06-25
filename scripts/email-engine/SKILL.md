---
name: build-workspace-experiment
description: Stand up a workspace's core cold-email experiment in Email Bison from Claude Code — build campaigns from library sequences, allocate the clean contact segment across arms, push leads (throttled), and launch. Use when building outbound for an Email Engine workspace (eso, founder, investor, provider, advisor) directly against the live Bison instance, the way the ESO program was built on 2026-06-24.
---

# Build a workspace's core experiment (Claude Code playbook)

This is the repeatable version of how the ESO outbound was built by hand on 2026-06-24. It turns a
set of library sequences into a live, contact-loaded, A/B experiment in Email Bison for one
workspace. The app's UI/API is improving to do this natively (see `HANDOFF-email-engine-fixes.md`),
but until then this tooling is the proven path.

The machinery lives in `scripts/email-engine/`:
- `config.ts` + `configs/<slug>.json` — the declarative spec for a workspace's experiment.
- `transform.ts` — library template → instance-correct Bison step (tags, spacing, HTML, wait clamp).
- `bison.ts` — throttled, idempotent, fail-fast Bison client for the custom instance.
- `build-experiment.ts` / `push-experiment.ts` / `launch.ts` — the three phases.

`npm run ee:build` / `ee:push` / `ee:launch`, each `-- --workspace <slug>` and `--commit` to apply.

## Hard-won facts about this Bison instance (READ FIRST)
These are non-obvious and each one broke the build before it was understood:

1. **ONE shared custom base URL for all workspaces.** Bison is `send.visitstartupscience.com/api`
   (NOT the default `dedi.emailbison.com`), and it is the SAME host for every workspace — workspaces
   are distinguished by API KEY, not URL. Set once via the in-app "Email Bison instance URL" setting
   or `EMAILBISON_BASE_URL`; it's also the code default in `secrets.bisonBaseFor()`. Do NOT use a
   per-workspace base (`workspaces.bisonBaseUrl` is legacy/unused — that approach was tried and
   reverted). A key 401s against the wrong base with a *misleading* "not authenticated" message.
2. **Keys are workspace/team-scoped Sanctum tokens (`N|...`).** They are stored encrypted in the app
   (can't decrypt locally). For a Claude Code build, the user PASTES the key; set it as
   `EMAILBISON_API_KEY__<slug>` in `.env`. Verify with `GET /sender-emails` → 200.
3. **Lead writes must be THROTTLED to ~1/sec.** Bursting (the old adapter's 500/min) trips a per-token
   abuse guard that returns a disguised **401** and then BLOCKS THE TOKEN for a cooldown — it looks
   exactly like a bad key. `bison.ts` paces at 1/sec and backs off on 401/429. ~1,800 leads ≈ 30 min.
4. **Leads are account-global and emails are unique.** Re-creating an email 422s "already taken".
   `ensureLeadThrottled` searches first and reuses the existing id, so pushes are idempotent and
   re-runnable (and cross-campaign overlaps just attach the existing lead).
5. **`sequence-steps` APPENDS, never replaces; no per-step DELETE.** To change a sequence you must
   `DELETE /campaigns/:id` and recreate. `ee:build --commit` does delete+recreate on rebuild — safe
   ONLY before leads are pushed.
6. **Schedule shape:** per-day booleans + `start_time`/`end_time` in `H:i` (not `H:i:s`) +
   `save_as_template:false`. **`wait_in_days` must be ≥ 1** on every step.
7. **Merge-tag dialect:** instance uses single-brace UPPERCASE (`{FIRST_NAME}`, `{COMPANY}`). Our
   templates use `{{snake_case}}`. `transform.ts` maps them, strips `{{sender_*}}` sign-offs (Bison
   injects the signature per inbox), converts to HTML, and inserts `<p><br></p>` spacers (the instance
   shows no gap between bare `<p>` tags — emails are unreadable without spacers).
8. **Custom variables must pre-exist.** `persona` and `sub_type` were created once via
   `POST /custom-variables {name}`. New workspaces that send custom vars need them created first.
9. **No subject-line / step variants via API.** Don't try (see memory `bison-no-subject-variants`).
   Test subjects at the arm level instead.
10. **Schema drift:** the app code is changing in parallel. This tooling queries the segment directly
    and selects only the workspace columns it needs, so a not-yet-migrated column (e.g.
    `persona_match`) doesn't break it. If you hit `column "x" does not exist`, that's the live DB
    lagging the code — don't apply another session's migration; the tooling already routes around it.

## The workflow

### 0. Connect
- Confirm the workspace's Bison **base URL** and get a **working API key** from the user (paste).
  Set `EMAILBISON_API_KEY__<slug>=<key>` in `.env`. If the base differs from default, set
  `workspaces.bisonBaseUrl` for that workspace. Verify: `GET /sender-emails` returns 200 + inboxes.

### 1. Decide the experiment (judgment calls — confirm with the user)
- **Which sequences** become arms (one per style is a clean test; pick the strongest per style).
- **Persona scope:** `personaLike` (e.g. `'ESO %'`) to capture all sub-personas, or `personaFilter`
  for exact. `null`+`null` = all sendable in the store (only safe if the store is 100% this audience).
- **Sender partition:** assign each arm its OWN sending domain's inboxes. Sender `daily_limit` is
  per-inbox and POOLED across campaigns, so sharing all senders across arms gives no isolation and
  caps the whole program at the shared total. List senders: `GET /sender-emails`.
- **Schedule** (days/hours/timezone).
- Write `scripts/email-engine/configs/<slug>.json` (copy `eso.json` as the template).

### 2. Build campaigns + experiment
- `npm run ee:build -- --workspace <slug>` (plan) → review → `--commit`.
- Verify in Bison: each campaign has the right steps (spacing OK), schedule, and its partitioned
  senders. Send yourself a test from one campaign if unsure.

### 3. Push contacts (throttled, ~1/sec — runs ~30 min for ~1,800)
- `npm run ee:push -- --workspace <slug>` (plan) → confirm the eligible count and per-arm split.
  The plan reports `sendable − no-company − suppressed = eligible`. **Suppression excludes anyone
  already a lead in another campaign** (don't double-email people in another active sequence).
- Run with `--commit` in the BACKGROUND; monitor `scratch_push*.log` for `done:` / `FATAL`.
  It's idempotent and per-batch durable — if it aborts, just re-run; it resumes where it stopped.

### 4. Launch
- `npm run ee:launch -- --workspace <slug>` (plan) → `--commit` to resume (start sending) all arms.

## Gotchas checklist before launch
- [ ] Base URL + key verified (GET senders = 200).
- [ ] Every campaign has steps with visible spacing and correct merge tags.
- [ ] Senders partitioned per arm (not all-on-all).
- [ ] Push plan's eligible count looks right; suppression caught other-campaign overlaps.
- [ ] Spot-check lead counts per campaign in Bison after push.
- [ ] Only launch when copy + leads are confirmed.
