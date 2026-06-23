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

1. **Voice & anti-patterns** (`references/voice.md`) — this is the biggest quality lever. Every email must
   pass the anti-AI-writing rules. No em dashes anywhere. No buzzwords, no AI-tell vocabulary, no "not X
   but Y," no rhetorical-question hooks, no filler transitions.
2. **Sender mode** — first-person Greg, or write as the sender and **edify Greg** (every demo is with Greg
   personally; his reputation carries the email). Use ONE sharp proof point, never a stack.
3. **Persona** — open in the reader's world. Use the persona's pain/value and Lifecycle angle; never describe
   features generically.
4. **House rules** — each email under ~90 words, exactly one low-friction CTA, merge tags only, a short human
   signature ending with {{sender_linkedin}}. Later steps add a new angle, never "just bumping this."

### Output format

Present the sequence as clean, copy-pasteable steps. For each step:

```
Step N  ·  wait: D days  ·  [variant: A/B if used]
Subject: <subject line>

<email body, with merge tags and a signature>
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
- [ ] Merge tags only — no assumed facts a tag can't supply. Offer styles use {{magnet_link}}.
- [ ] Follow-ups add a new angle; none say "just following up" or "did you see my email."
- [ ] Reads like a mentor who has done it, not a marketer selling.
```
