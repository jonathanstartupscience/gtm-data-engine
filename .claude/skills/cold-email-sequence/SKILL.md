---
name: cold-email-sequence
description: >
  Writes complete cold-email sequences for Startup Science using a standardized library of
  email STYLES and target PERSONAS, in Gregory Shepard's voice. Use this skill whenever someone
  asks to write a cold email, draft a cold-email sequence or campaign, create outbound email
  copy, write a follow-up sequence, or test messaging for a persona. Trigger on phrases like
  "write a cold email," "draft a sequence for [persona]," "I need outbound copy for ESOs,"
  "write a pain-based email," "make me an offer email with [lead magnet]," or any request to
  produce cold-email messaging for the Email Engine. This mirrors the in-app "Write with AI"
  sequence generator, so the output should match what the app produces: a reusable merge-tag
  template. This is for COLD EMAIL, not cold calls (see cold-call-sequence) and not general
  marketing email (see email-composer).
---

# Cold Email Sequence Generator

You write world-class cold-email sequences for the Startup Science GTM team. This skill is the
interactive twin of the in-app generator: same IP, same output shape, but you write the copy
directly in the conversation so the user can iterate before any Anthropic key is wired into the app.

**Default output:** a reusable **merge-tag template** — one sequence that personalizes itself
across a whole segment at send time via Bison tags ({{first_name}}, {{company}}, {{title}}, and
where relevant {{trigger}}, {{magnet_link}}, {{sender_linkedin}}). Do not write one-off copy for a
single named prospect unless the user explicitly asks for that.

Read the reference files before generating. They are the source of truth and mirror the app:
- `references/styles.md` — the email STYLES (strategic skeletons; step count + each step's job).
- `references/personas.md` — the target PERSONAS (pain, value, subject angles, Lifecycle framing).
- `references/voice.md` — Gregory Shepard's voice, the anti-AI-writing rulebook, and the edification rule.
- `references/lead-magnets.md` — the offer assets for offer-centric styles.

---

## Phase 1 — Confirm the inputs (brief, conversational)

Do not dump a form. If the user already named some of these, acknowledge and ask only for the rest.
You need five things; infer sensible defaults and state them rather than interrogating:

1. **Style** — which approach (see `references/styles.md`). If they describe an intent ("lead with a
   problem," "give them a guide first"), map it to the closest style yourself and confirm in one line.
2. **Persona** — who it's going to (see `references/personas.md`). If they give a job title or org type,
   resolve it to a persona yourself.
2b. **Specific pain/angle** (pain-driven styles only — Pain, Insight, Benchmark, Trigger) — offer the
   persona's "Pains to choose from" list and let them pick one, or accept their own. Make it the
   through-line of the sequence. If they don't pick, use the persona's general pain.
3. **Sender mode** — is the sending inbox **Greg himself** (first person), or **someone else**? Default
   to "someone else → edify Greg." If someone else, get the sender's name.
4. **Offer** — only if the style is offer-centric: which lead magnet (or let you pick the best fit for the
   persona from `references/lead-magnets.md`).
5. **A/B variant?** — optional. Default to no. If yes, produce an alternate subject + opener for step 1 only.

Also accept an optional **extra context** line (a real trigger, an angle to emphasize, a constraint) and weave it in.

If a critical input is genuinely ambiguous, ask one tight question. Otherwise proceed — bias toward producing.

---

## Phase 2 — Generate the sequence

Follow the chosen style's skeleton **exactly**: the number of emails and each step's job are fixed by the
style. You write the copy. Apply, in priority order:

> **Each step must do ITS step's job, not a generic one.** The most common failure is defaulting the
> middle and final steps to "restate the pain, then invite a demo with Greg" no matter the style. Do not.
> A pain-centric step 2 is a concrete **proof point** (a real result, a named peer, a Greg credential),
> not a pain restatement; pain-centric step 3 **reframes the cost of inaction** tied to {{company}}, not
> a "see it with Greg" invite. An insight step 3 invites **peer push-back** with Greg, not a one-way demo.
> A trigger step 2 ties the trigger to a **specific outcome + one proof point**. A benchmark step leads
> with a **real figure**, never "the data shows." Re-read the step's row in `references/styles.md` before
> writing it, and make that step do that job.


1. **Voice & anti-patterns** (`references/voice.md`) — this is the biggest quality lever. Every email must
   pass the anti-AI-writing rules. No em dashes anywhere. No buzzwords, no AI-tell vocabulary, no "not X
   but Y," no rhetorical-question hooks, no filler transitions.
2. **Sender mode** — first-person Greg, or write as the sender and **edify Greg** (every demo is with Greg
   personally; his reputation carries the email). Use ONE sharp proof point, never a stack.
3. **Persona** — open in the reader's world. Use the persona's pain/value and Lifecycle angle; never describe
   features generically.
4. **House rules** — each email under ~90 words, exactly one low-friction CTA, merge tags only, and
   **no sign-off** (no name, no {{sender_linkedin}}, no closing). Email Bison injects the signature
   per sender inbox, so the copy must end on the CTA. Later steps add a new angle, never "just bumping this."

### Output format

Present the sequence as clean, copy-pasteable steps. For each step:

```
Step N  ·  wait: D days  ·  [variant: A/B if used]
Subject: <subject line>

<email body, with merge tags, ending on the CTA — no sign-off (Bison adds the signature)>
```

After the steps, add:
- **Strategy** — 2–3 sentences on why this style+persona combination works (the rationale).
- **Paste-in note** — remind the user these are merge-tag templates ready for the app's Sequence Builder
  (Email Engine → Sequences → New) or Bison directly, and that they can edit before saving.

---

## Quality checklist (run before you present)

- [ ] Step count matches the style skeleton exactly.
- [ ] Zero em dashes. Zero banned buzzwords / AI-tell words (scan `references/voice.md`).
- [ ] Each email is under ~90 words with exactly one low-friction CTA.
- [ ] First sentence is about the reader, not us.
- [ ] One sharp proof point, not a stack. Greg edified correctly per sender mode.
- [ ] Merge tags only — no assumed facts a tag can't supply. Offer styles use NO link: describe the asset and ask to send it (reply-to-receive, manual fulfillment).
- [ ] No sign-off — body ends on the CTA (no name, no {{sender_linkedin}}; Bison adds the signature).
- [ ] Follow-ups add a new angle; none say "just following up" or "did you see my email."
- [ ] Reads like a mentor who has done it, not a marketer selling.

The checklist above is YOUR self-review. It is not a substitute for the independent reviewer below.

---

## Phase 3 — Independent review and corrections (REQUIRED before you present or seed)

Every sequence you draft must pass the **`cold-email-review`** skill before you show it to the user or
load it into the app. This is a hard step, not optional: the reviewer is an independent judge held to
the same IP you write against, and it catches what self-review misses. The reviewer **only assesses** —
it never edits your copy. Applying corrections is YOUR job. The loop is:

1. **Submit** the full drafted sequence to the `cold-email-review` skill. Pass the steps and, if you have
   it, the `meta` block (`styleKey`, `personaKey`, `painKey`, `senderMode`, `abVariant`) so it grades
   against your declared intent rather than guessing.
2. **Read the verdict** it returns (`PASS` / `REVISE` / `REJECT`) plus its `suggestedFixes` and `revisions`.
3. **Apply the corrections yourself:**
   - For each entry in `suggestedFixes` (single-correct-fix items — em dashes, illegal merge tags, a
     missing `{{sender_linkedin}}`), apply the exact `find`→`replace` it gives you.
   - For each entry in `revisions` (judgment items — over-length bodies, stacked proof points, a weak
     opener, a fabricated trigger, wrong step count/style), **rewrite the copy yourself** to resolve it.
     The reviewer deliberately does not hand you replacement prose for these; that is your craft to fix.
4. **Re-submit the corrected sequence** to `cold-email-review`. Repeat steps 2–4 until the verdict is
   `PASS`. Cap the loop at **3 rounds**: if it still is not `PASS` after three, present the latest draft
   to the user *with the reviewer's outstanding findings shown plainly* and let them decide — never
   silently ship a sequence the reviewer flagged.
5. Only a `PASS` (or an explicit user override after seeing the findings) may proceed to "present,"
   save via `POST /sequences`, or the seeder. A `REJECT` means redo from the brief — do not patch it.

Do not describe the review to the user as a formality. Show them the final verdict and, if you used the
override, exactly what remained open.

---

## Getting sequences into the app (the Claude Code → Email Engine workflow)

Sequences you write here become real, reusable templates in the app's **Sequence library**
(Email Engine → Sequences), then feed campaigns and experiments. Two ways in:

**A) Bulk-load via the seeder (preferred for batches).** Emit the approved sequences as a JSON
array matching the `/api/outbound/sequences` body — one object per sequence with `name`,
`description`, `persona`, `steps[]`, and a `meta` block (`styleKey`, `personaKey`, `painKey`,
`painLabel`, `leadMagnetId`, `senderMode`, `abVariant`, `rationale`, `genModel`). Save it to a
gitignored file (e.g. `_eso-seed.json`) and run:

```
# token never enters the transcript — set it in the shell:
$env:API_SERVICE_TOKEN = "<the token, also set in Railway>"   # PowerShell
npm run seed:sequences -- --file _eso-seed.json --api https://gtm.startupscience.io --dry   # preview
npm run seed:sequences -- --file _eso-seed.json --api https://gtm.startupscience.io          # for real
```

The seeder authenticates with `API_SERVICE_TOKEN` (env-only service token; see CLAUDE.md), POSTs
through the real validated API, skips names that already exist, and supports `--replace` to
overwrite after edits. The saved `meta` is what powers the library's input chips + filters.

**B) Paste into the app by hand.** For one or two sequences, open Email Engine → Sequences → New
and paste each step in. Or use the in-app **"Write with AI"** generator (needs `ANTHROPIC_API_KEY`
set) to draft directly in the UI.

### Then: campaigns and experiments (in the app)
Once sequences are in the library: build one **campaign per sequence** (each Bison campaign carries
exactly one sequence), then to test several head-to-head create an **Experiment** (Campaigns →
A/B experiments) with one arm per campaign. The experiment splits the audience by weight and pins
each contact, so you prune losers (weight 0) and scale winners without reshuffling anyone. The
in-app KB ("Using the Email Engine") documents this for app users; this section is the dev/agent view.
