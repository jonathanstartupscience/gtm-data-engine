# Reviewer quick-reference (distilled for fast deterministic checking)

This is a convenience digest of the writer's IP for the Tier-1 mechanical gates. **The writer's
reference files are authoritative** (`../../cold-email-sequence/references/*.md`). If this digest ever
disagrees with them, the writer's files win and this file is the bug — flag it in the review.

---

## Style skeletons — step count + each step's job (gate A1/A2/A3)

Mirrors `styles.md`. Step count must match EXACTLY.

| styleKey | Steps | Cadence (wait days) | Step jobs (summary) |
|---|---|---|---|
| `michelle-3-paragraph` | 3 | 0, 4, 6 | 1: full 3-paragraph email (legitimacy+ask / vision+homework / frictionless CTA). 2: +1 new specific reason, repeat CTA. 3: offer one concrete thing, graceful close. **Keeps 3-paragraph form (B4 exception).** |
| `pain-centric` | 4 | 0, 4, 5, 7 | 1: name a specific pain + downstream consequence + soft disqualifier + light CTA. 2: one concrete proof point. 3: reframe cost of inaction tied to {{company}}. 4: breakup, door open. |
| `offer-centric` | 4 | 0, 4, 5, 7 | 1: lead with lead magnet + one thing it helps; attribute to Greg; ask to send it. 2: one insight teaser, re-offer. 3: bridge to light conversation. 4: leave it on the table, no pressure. **Reply-to-receive: NO {{magnet_link}}, no URL, no link of any kind. The asset is offered and sent manually on reply.** |
| `authority-centric` | 3 | 0, 4, 6 | 1: one credibility signal -> reader's goal, light ask. 2: name a peer org like {{company}} + outcome. 3: confident invite to see it with Greg. |
| `insight-centric` | 3 | 0, 4, 6 | 1: specific non-obvious observation (Lifecycle out-of-sequence thesis), light ask. 2: extend with implication for {{company}}. 3: invite to push back with Greg, peer-to-peer. |
| `trigger-centric` | 3 | 0, 4, 6 | 1: reference {{trigger}} for {{company}} + why now. 2: tie trigger to an outcome + one proof point. 3: respect the window, easiest next step. **Requires {{trigger}}; never fabricate a trigger.** |
| `curiosity-centric` (beta) | 3 | 0, 4, 6 | 1: intriguing opener compelling a one-line reply (**<=50 words**). 2: reveal one piece, re-invite. 3: drop the mystery, plain light ask. |
| `compliment-centric` (beta) | 3 | 0, 4, 6 | 1: specific genuine compliment about {{company}} + pivot to light ask. 2: one useful idea related to the praise. 3: warm short close. |
| `question-centric` (beta) | 3 | 0, 4, 6 | 1: one well-aimed question, minimal framing, no pitch. 2: ask differently + why. 3: offer to share how others answer (via Greg). |
| `benchmark-centric` (beta) | 3 | 0, 4, 6 | 1: benchmark + gap for persona, cite source/Greg's research, light ask. 2: a second figure tied to {{company}}. 3: the concrete way to close the gap. |
| `peer-fomo-centric` (beta) | 3 | 0, 4, 6 | 1: anchor to what orgs like {{company}} do with Startup Science, light ask. 2: name the outcome + one proof point. 3: confident invite to see it with Greg first. |

Cadence is the writer's default; small deviations are fine if the *intent* holds (early follow-ups
close, later ones spaced). Step count and step jobs are not negotiable.

---

## Merge-tag whitelist (gate D1)

ONLY these are legal. Any other `{{...}}` is a defect. This list is the app's actual supported set —
`SEQUENCE_VARS` in `web/src/components/SequenceStepsEditor.tsx` — which is the ultimate source of truth
for what resolves at send time. A tag not in this list ships as literal `{{...}}` text to the inbox.

```
{{first_name}}  {{last_name}}  {{company}}  {{title}}  {{persona}}  {{sub_type}}
{{trigger}}  {{magnet_link}}  {{sender_linkedin}}
```

- The cold-email writer's house rules use a narrower set in practice (`first_name`, `company`, `title`,
  `trigger`, `magnet_link`); the extras above are legal but rarely needed in cold copy.
- `{{magnet_link}}` is a legal app tag but **offer-centric must NOT use it** (offers are reply-to-receive; the asset is sent manually). A `{{magnet_link}}` or any URL in an offer body is a D3 failure.
- `{{trigger}}` is required by `trigger-centric`.
- **No sign-off in copy (gate B3):** cold-email bodies end on the CTA. Email Bison injects the signature
  per sender inbox, so the copy must NOT contain a name, a closing, or `{{sender_linkedin}}`. `{{sender_linkedin}}`
  is a legal tag (so it never trips D1), but its presence in a body is a B3 failure — flag the whole
  trailing signature block and suggest removing it.
- **`{{sender_name}}` is NOT legal** — there is no such tag (it ships as literal text). It is also part of
  a sign-off, which copy should not have at all. Flag it under D1 (illegal tag) and remove the line; the
  signature comes from Bison, not the copy. Do not "replace" it with a real name.
- Common illegal invented tags to catch: `{{sender_name}}`, `{{role}}`, `{{industry}}`, `{{city}}`,
  `{{pain}}`, `{{competitor}}`, `{{recent_news}}`, `{{calendar_link}}` — none exist; flag and suggest the
  nearest legal tag or removal.

---

## Banned terms (gates C3, C4, C5) — case-insensitive substring match

Treat these as a denylist. Quote any hit with its step number.

**C3 Buzzwords:** unlock, leverage, game-changer, game changer, disrupt, disruptive, empower,
transformative, innovative, synergy, robust, holistic, world-class, world class, best-in-class,
best in class, cutting-edge, cutting edge, move the needle, double down.

**C4 AI-tell vocabulary:** delve, tapestry, landscape (figurative use only), testament, pivotal,
crucial, foster, underscore, showcase, vibrant, intricate, interplay, garner, enduring, nestled,
renowned, valuable insights, key takeaways.

**C5 AI transitions:** Furthermore, Moreover, Additionally, Ultimately, Importantly, Notably,
That said, In conclusion, At the end of the day.

**C6 phrase tells (match the phrase, then judge):** "we've all been there," "let's be honest",
"here's the truth no one talks about", "what if I told you", "studies show", "experts say",
"many founders find", "serves as", "stands as", "boasts", "a pivotal moment", "a testament to",
"enduring legacy", "not a ___, it's a ___" / "isn't ___, it's ___" (the C2 not-X-but-Y pattern).

**C2 covers THREE forms of the contrarian construction — all banned:**
1. The hard two-sentence form: "X is not Y. It is Z." / "isn't a tool, it's a system."
2. The inline trailing-contrast clause: "X, not Y" ("track progress by phase, not activity";
   "durable, not just fundable").
3. The negate-the-obvious-then-assert form: a sentence that negates a strawman, followed by one that
   asserts the real point — "Most startups do not fail from bad ideas. They fail because…" /
   "investors are not buying the deck. They are reading…" / "advisors do not get smarter. They just…".
   Detect it as: a sentence containing a negation (`do not` / `is not` / `are not` / `does not` / `cannot`)
   immediately followed by a sentence starting with a correcting pronoun (`It is`, `They are`, `They just`,
   `That is`, `They fail`, `It comes`…).

All three are rewrites to a direct statement (drop the strawman, state the real point). The ONE allowed
exception is Greg's canonical signature line "funding is an outcome, not a plan" (a named brand phrase in
voice.md, not an AI tell). Flag every other instance of any of the three forms.

## Punctuation tells (gate C1)

- **Em dash** `—` (U+2014): zero allowed, subject or body.
- An en dash `–` (U+2013) or a double hyphen `--` used as a sentence break counts as an em-dash tell — flag it.
- Suggested fix: replace with a period (new sentence) or a comma, whichever preserves the meaning. Capitalize the next word if you make a new sentence.

---

## Greg's real bio facts (gate E3) — anything outside this set is fabrication

- 12 company exits (BioTech, TransitTech, AdTech, MarTech).
- 35 years of primary research into why startups succeed and fail.
- Author of *The Startup Lifecycle* (BenBella / Penguin Random House).
- TEDx speaker; host of the ForbesBooks Startup Science podcast.
- Co-founder of the Fulbright Entrepreneurship Initiative.
- Built his first company out of poverty with undiagnosed dyslexia and autism.
- Platform proof (authority/peer styles, sparingly): 89,000+ founders; 150+ ESO partners globally.

Specific outcome numbers attributed to a named customer ("we grew Acme's cohort retention 40%") are
fabrication unless the user supplied them as extra context — flag as E3 / REJECT.

---

## Word-count method (gate B1)

Count words in the **body only** (exclude the subject and the signature block). Split on whitespace.
Merge tags count as one word each. Limit is ~90 (curiosity style: 50). Quote the count on a failure.
