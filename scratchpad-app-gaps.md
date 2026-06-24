# App gaps & improvement opportunities — found while building ESO campaigns (2026-06-24)

Notes for the *other* (app-improvement) Claude Code sessions. This session is operational
(build the ESO outbound), but these are real friction points the build surfaced.

## 1. Workspace persona binding can't express "all sub-personas" (HIGH)
- `workspaces.eso.persona = 'eso'`, but contacts carry persona values like `"ESO Leadership"`,
  `"ESO Partnerships"`, `"ESO Program"`, `"ESO Founder/GP"`.
- `segment()` / `segmentWithIds()` filter `eq(contacts.persona, workspace.persona)` →
  `eq(persona, 'eso')` → **0 contacts**. The experiment `filterFor()` forces the workspace
  persona as the floor (experiment.ts:36-40), so the built-in experiment push would send nothing.
- Impact: the app's own experiment flow is currently unusable for ESO without either
  (a) re-tagging all contacts to persona='eso', or (b) a persona-group concept.
- Suggested fix: let a workspace map to a SET of persona values (e.g. `personaMatch: string[]`
  or a prefix/`LIKE 'ESO %'`), or decouple "workspace audience" from the single persona string.
  At minimum, allow an experiment to override with persona=undefined to mean "all sendable in
  workspace" without the workspace floor clobbering it.

## 2. No env/local fallback to decrypt or inject a Bison key for headless work (MED)
- Bison keys are stored DB-first, AES-256-GCM under `APP_ENCRYPTION_KEY`. A headless caller
  (Claude Code) without that env var gets an EMPTY key → silent 401s. `listSenders()` swallows
  the error and returns `[]`, which looks like "no senders configured" rather than "auth failed."
- Suggested fix: (a) `listSenders()` and other GETs should distinguish 401/403 from empty;
  surface auth failures instead of returning `[]`. (b) Document that headless runs need either
  the prod `API_SERVICE_TOKEN` (to use the live API) or `EMAILBISON_API_KEY__<slug>` / global
  `EMAILBISON_API_KEY` in env.

## 3. `{{trigger}}` merge tag has no population path in the segment push (MED)
- Sequence #12 (ESO · Trigger) uses `{{trigger}}` in step 1. The activate stage only emits
  `persona` and `sub_type` custom_variables (activate.ts:81-84). There is no per-contact
  `trigger` value sent, so `{{trigger}}` renders empty/literal in Bison.
- Suggested fix: either (a) exclude trigger-style sequences from the generic segment push,
  (b) add a `trigger` field to the contact/segment and map it into custom_variables, or
  (c) have the KB/sequence picker warn when a chosen sequence references a merge tag the push
  doesn't supply.

## 4. No end-to-end "stand up an experiment from N sequences" path (MED)
- Building an experiment is multi-step and manual: create each campaign (POST /campaigns builds
  it in Bison from steps), then create the experiment referencing those campaignIds, then
  preview, then push, then launch each campaign. No single call takes
  "{sequences[], schedule, senders, weights}" → live experiment.
- Suggested fix: a `POST /experiments/build` that, given sequence template IDs + schedule +
  senders + weights, creates one Bison campaign per arm, wires the arms, and returns the
  experiment ready to preview/push. (This session implements that flow as a script; consider
  promoting it into the app.)

## 5. `verify-stale` coverage — 82,696 of 85,727 contacts have NULL email status (INFO)
- Only ~2,367 contacts are sendable (deliverable/risky_catchall). The rest are unverified.
  Not a bug, but the ESO addressable universe is currently small because verification hasn't
  been run broadly. Worth a bulk verify pass (credit cost) to expand the pool.
