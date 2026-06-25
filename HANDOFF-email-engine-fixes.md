# Handoff: Email Engine fixes the ESO build surfaced

**Context for the receiving chat:** A separate session just built the ESO outbound program by
hand (6 sequences → 6 Bison campaigns → one 6-arm experiment over ~2,329 contacts) against the
live eso workspace. The app's Email Engine *could not* have done this as written — every Bison
write call failed, the copy would have shipped with broken merge tags and no paragraph spacing,
and the contact segment query returns 0. Below is everything that broke, with the corrected
behavior verified against the live instance, framed as app changes to make.

The eso workspace's Bison instance is **`https://send.visitstartupscience.com/api`** (a custom/
self-hosted Bison, NOT `dedi.emailbison.com`). All shapes below were verified there by inspecting
a live working campaign and iterating on 422 errors. **Treat the live instance as the source of
truth over the vendor docs the adapter was written from** — they diverge.

---

## P0 — these block sending entirely

### 1. Bison adapter payload shapes are wrong (`src/engine/adapters/emailbison.ts`)
Every write 422'd. Corrected shapes (all verified, return 200/201):

- **`scheduleCampaign()`** — currently sends `{ timezone, days:[{day,from,to}] }`. Instance wants
  per-day booleans + `H:i` times (NOT `H:i:s`) + a required `save_as_template`:
  ```json
  { "monday":true,"tuesday":true,"wednesday":true,"thursday":true,"friday":true,
    "saturday":false,"sunday":false,
    "start_time":"08:00","end_time":"17:00","timezone":"America/New_York","save_as_template":false }
  ```
- **`setSequenceSteps()`** — currently sends `{ steps:[…] }`. Instance wants `{ title, sequence_steps:[…] }`.
  Each step: `{ order, wait_in_days, email_subject, email_body }`. **`wait_in_days` must be ≥ 1**
  for EVERY step (our templates use 0 for step 1 → clamp to 1).
  ⚠️ **This endpoint APPENDS, it does not replace.** Re-posting duplicates steps. There is **no
  DELETE for an individual step** (only `DELETE /campaigns/:id` for the whole campaign). So "edit a
  sequence" cannot be done by re-posting steps — today the only safe path is delete+recreate the
  campaign. Either add an idempotency guard or model edit-as-recreate explicitly.
- **`createLead()`** — sending `custom_variables:[{name:'persona',…}]` 422s unless the custom
  variable already exists. Must `POST /custom-variables {name}` once per variable first. (This
  session created `persona` and `sub_type` in the eso instance, ids 4 and 5.) Adapter should
  ensure-create custom vars before first lead push.
- **detach path** `/campaigns/:id/leads/detach-leads` is 404. To remove a lead use `DELETE /leads/:id`.
- **`listSenders()`** path `/sender-emails` is correct. **But it swallows errors and returns `[]`**,
  which during this build looked like "no senders configured" when the real cause was a wrong
  base/key (401). GETs should surface 401/403 distinctly from an empty list.

### 2. Merge-tag dialect mismatch (`src/engine/email/*`, the AI writer, all stored templates)
Templates + the AI writer emit **`{{snake_case}}`** (`{{first_name}}`, `{{company}}`,
`{{sender_name}}`, `{{sender_linkedin}}`, `{{trigger}}`). This Bison instance uses
**single-brace UPPERCASE**: `{FIRST_NAME}`, `{COMPANY}`, `{LAST_NAME}`, `{TITLE}`,
`{SENDER_FULL_NAME}`. Mismatched tags render literally → broken emails. Also bodies here are
**HTML** (`<p>…</p>`), our templates are plain text with `\n`.
**Fix:** add a translation layer at the activate/build boundary (keyed to the workspace's Bison
flavor), or standardize templates on the instance dialect. This session used a transform that:
maps tags, **strips `{{sender_*}}` sign-off lines** (Bison injects the signature per inbox),
converts plain text → HTML, and clamps `wait_in_days`.

### 3. Paragraph spacing — emails were unreadable (part of the HTML conversion)
A naive `paras.join('')` of `<p>…</p>` renders with **no visible gap** between paragraphs in
Bison (confirmed against the live campaign). The instance uses an **empty `<p><br></p>`** as the
visual paragraph break. Join content paragraphs WITH `<p><br></p>` between them. (The user caught
this immediately on review — "no space between the CTA and the paragraph before it.") Skimmability
is a real quality bar; the writer/transform should emit spacers by default.

### 4. Workspace persona binding matches 0 contacts (`src/engine/stages/activate.ts`, `experiment.ts`)
`workspaces.eso.persona = 'eso'`, but contacts carry `"ESO Leadership"`, `"ESO Partnerships"`,
`"ESO Program"`, `"ESO Founder/GP"`. `segment()/segmentWithIds()` filter `eq(contacts.persona,
workspace.persona)` → **0 rows**, and `experiment.ts:filterFor()` forces the workspace persona as
the floor, so the built-in experiment push sends nothing for ESO.
**Fix:** let a workspace map to a SET of persona values (e.g. `personaMatch: string[]` or a
`LIKE 'ESO %'` prefix), or allow an experiment to pass `persona=undefined` ("all sendable in
workspace") without the workspace floor clobbering it. (This session bypassed it by building the
segment with no persona filter — safe here only because the store's sendable set is 100% ESO.)

---

## P1 — operational correctness / quality

### 5. Bison base URL is per-workspace and was unset (`src/lib/secrets.ts`, Workspaces page)
The eso key 401s against the default `dedi.emailbison.com`; the correct base is
`send.visitstartupscience.com/api`. `workspaces.bisonBaseUrl` exists in schema but wasn't set
(this session set it). Make base URL a first-class field on the Workspaces page, and validate a
key against its base on save (a "test connection" button would have caught all of this instantly).

### 6. Sender quota is per-inbox and SHARED across campaigns — surface this in the UI
`daily_limit: 25` lives on the sender mailbox, not the campaign, and is pooled across every
campaign that inbox is attached to. So attaching all 15 senders to all 6 campaigns means the whole
program is capped at 375/day *total* and arms compete for it — it does NOT give each campaign
375/day, and it destroys per-arm deliverability/attribution isolation. The experiment UI should
(a) show total daily capacity given the sender assignment, and (b) warn when senders are shared
across arms of the same experiment, or offer a "partition senders across arms" helper. (This
session partitioned: one sending domain per arm, the two Offer arms sharing one domain.)

### 7. `{{trigger}}` (and any merge tag the push doesn't supply) has no population path
Trigger-style sequences reference `{{trigger}}`, but the activate stage only emits `persona` and
`sub_type` custom vars — so `{{trigger}}` renders blank. Either exclude sequences whose tags the
push can't fill, add the field to the contact/segment, or warn in the picker. (This session
swapped the Trigger arm out for a second Offer to avoid the blank.)

### 8. No end-to-end "stand up an experiment from N sequences" path
Building this was N manual steps (create each campaign in Bison from a template, wire arms, preview,
push, launch). Consider a `POST /experiments/build` that takes `{sequenceTemplateIds, schedule,
senderMapping, weights}` and creates one campaign per arm + wires the experiment, returning it
ready to preview/push. This session effectively prototyped that as a script.

### 9. Contacts with no company name render `{COMPANY}` blank (data hygiene)
38 of 2,367 sendable ESO contacts have no company; their subject/body `{COMPANY}` would be blank.
The push should optionally exclude rows missing a tag their sequence uses, and the segment preview
should report the count.

### 10. 🔴 No cross-campaign dedup on push — would double-email people already in another campaign
The activate/experiment push selects from the store's segment with NO check against who is already
a lead in another (active) Bison campaign. In this build, **524 of 2,329 segment contacts were
already in the pre-existing "June 15th Test" campaign** (490 `in_sequence`, 30 `replied`, 14
`bounced`). Pushing blind would have sent those people a second concurrent sequence — a
deliverability + reputation + recipient-experience problem, and re-cold-emailing the 30 who already
replied. (Caught by the user, not the tooling.)
**Fix:** before push, fetch existing leads across the workspace's active campaigns and subtract any
overlapping email (especially `in_sequence`/`replied`/`bounced`). The experiment preview should
report "N already in another campaign — excluded." Consider a workspace-level suppression list
(replied/bounced/unsubscribed) that every push honors automatically.

---

## ⛔ Known limitation — do NOT build this: Bison API has no subject-line / step variants
We tried to add per-step subject A/B variants (same body, two subjects). **This instance's API
does not expose any variant mechanism.** Verified exhaustively:
- Posting two steps with the same `order` → 422 "duplicate order".
- `variant:true` + `variant_from_step` in the sequence-steps payload is ignored — it just creates
  a normal follow-up step at the next order; the stored `variant` stays `false`, `variant_from_step`
  stays `null`.
- No variant routes exist: `/sequence-steps/:id/variants`, `/campaigns/:id/sequence-steps/:id/variants`,
  `/sequence-step-variants`, `/campaigns/:id/variants`, `/step-variants` all 404.
- The real human-built campaign (#3 "June 15th Test") has NO variant steps either — every step is
  `variant:false`. So variants are, at most, a UI-only construct on this Bison version/plan, not
  API-addressable.
**Implication for the app:** the Email Engine should NOT offer programmatic subject A/B variants for
this Bison flavor (it will silently no-op into extra follow-up steps). If subject testing is wanted,
do it at the SEQUENCE level (separate arms with different subjects) via the existing experiment
framework, not as in-step variants. (The `variant` field on `BisonSequenceStep` in the adapter is
effectively dead for this instance — document or gate it.)

## Reference: verified instance facts (eso workspace)
- Base: `https://send.visitstartupscience.com/api`; key is workspace/team-scoped (`N|...` Sanctum).
- 15 sender inboxes, 5 domains × {Greg, Jonathan, Gary}, `daily_limit` 25 each, warmup on.
- Lead fields: `email, first_name, last_name, title, company, notes`, plus defined custom vars.
- Schedule returns 201; sequence-steps returns 201 and APPENDS; campaigns support DELETE (async).
- Merge tags observed in a live working campaign: `{FIRST_NAME}`, `{COMPANY}`, `{SENDER_FULL_NAME}`.

## What's built right now (do not duplicate)
Experiment "ESO Core — 6-style head-to-head" (eso), 6 arms, even weights, all DRAFT, no leads:
bison #11 (3-para), #12 (offer/7-stream), #13 (offer/funding), #14 (pain/ROI), #15 (insight),
#16 (authority). Each on its own sending domain (offers share one). Copy corrected (spacing +
why-Greg openers on the two offers). Allocation staged: 2,329 eligible across arms; not yet pushed.
