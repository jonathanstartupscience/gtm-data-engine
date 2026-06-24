# Cold Email Styles

Each style is a fixed strategic **skeleton**: how many emails, what each one does, and the rules.
You write the copy; the skeleton keeps strategy consistent. Mirrors `src/engine/email/styles.ts`.

**Core styles** are fully tuned. **Beta styles** are newer/lighter — usable, less battle-tested.

## Shared house rules (apply to EVERY style)
- Each email under ~90 words. Shorter is better.
- Exactly one CTA per email, low-friction ("Worth a quick look?" beats "book a 30-min discovery call").
- Merge tags only: {{first_name}}, {{company}}, {{title}} (plus {{trigger}} for the trigger style). Never assume a fact a tag can't supply, same copy ships to the whole segment. Offers do NOT use a link tag (see offer-centric: reply-to-receive).
- Lead with the reader's world. First sentence is about them, not us.
- One sharp proof point beats three hedged claims. Greg's credibility is the proof, not a feature list.
- **No sign-off.** End each email on the CTA. Do not add a name, a closing, or {{sender_linkedin}}: Email Bison injects the signature per sender inbox, so a sign-off in the copy would duplicate it (and {{sender_name}} is not even a real tag).
- Later steps are short follow-ups with a NEW angle or lighter ask. Banned: "just bumping this," "did you see my last email."
- **Format for a phone screen:** break each body into 1-2 sentence beats separated by a blank line, so it's 2-3 short blocks. Never one dense paragraph. (Exception: the Three-Paragraph / Khare style keeps its explicit three-paragraph form.)

---

## CORE STYLES

### 1. Three-Paragraph (Khare method) — `michelle-3-paragraph`
**Summary:** Tight three-paragraph email: who you are + the ask, the shared vision, a frictionless CTA.
**Good for:** a clean, high-signal first touch when you've done your homework and want a fast yes/no.
**Subject:** signal value to the reader in a few words — enough to see what's in it for them. No wordplay.
**Style rules:**
- Body is exactly three short paragraphs.
- Para 1 (two sentences): who the sender is, legitimacy in one sentence (lean on Greg); then what you're asking/offering (ideally both).
- Para 2 (≤2 sentences): a window into the vision you'd build together + a peek at what you might need, written so it's obvious you researched {{company}}.
- Para 3 (≤2 sentences): the CTA. Make replying effortless ("Reply with a time and I'll send an invite"). Remove the awkward entry cost of answering a stranger.

| Step | Wait | Job |
|---|---|---|
| 1 | 0 | The full three-paragraph email: legitimacy + ask, shared vision + homework, frictionless CTA. |
| 2 | 4 | 2–3 sentence follow-up adding one new specific reason this matters for {{company}}; repeat the easy CTA. Not a bump. |
| 3 | 6 | Short final note offering one concrete thing (a relevant idea/resource) and a graceful close inviting a reply whenever timing's right. |

### 2. Pain / Problem-centric — `pain-centric`
**Summary:** Open on a specific pain and its downstream consequence, then offer a way out.
**Good for:** a persona with a sharp, nameable problem you can articulate better than they can.
**Subject:** name the problem or its consequence, specific to the persona. Not a benefit claim.
**Style rules:**
- Step 1 opens by naming a specific pain AND its downstream consequence (what it costs, breaks, prevents).
- Include a soft disqualifier so it doesn't read as a blast ("This may not be true for your program, but...").
- Only after the pain lands do you hint at the path out. No feature pitch.

| Step | Wait | Job |
|---|---|---|
| 1 | 0 | Name one specific pain + its consequence, with a soft disqualifier, then a one-line path out and a low-friction CTA. |
| 2 | 4 | Add one concrete proof point (a result, a peer, or Greg's credibility) that the path out is real; repeat the easy ask. |
| 3 | 5 | Reframe the cost of leaving it unsolved, tied to {{company}}; offer the lightest next step. |
| 4 | 7 | Brief breakup note that leaves the door open and removes pressure, with one final relevant line of value. |

### 3. Offer-centric (lead magnet) — `offer-centric`  *(uses an offer)*
**Summary:** Lead with a valuable, relevant resource. Give before you ask.
**Good for:** when you have a lead magnet that fits the persona and want to open by giving value.
**Subject:** reference the asset and its payoff for the persona. Specific value.
**Style rules:**
- **Reply-to-receive, never a link.** The asset is NOT delivered by a URL or a merge variable. Describe it compellingly and ASK if they want it sent ("Want me to send it over?"). A human fulfills the request manually on reply. Do NOT use `{{magnet_link}}` or any URL anywhere in the copy. The reply IS the conversion.
- Step 1 leads with the resource and the single most useful thing the reader gets, then the send-it ask.
- The offer is genuinely free and useful — no bait-and-switch into a hard pitch.
- Tie the resource to the persona's actual problem so it isn't generic content marketing.
- Greg authored these; attribute the resource to him for authority.

| Step | Wait | Job |
|---|---|---|
| 1 | 0 | Open with the lead magnet + the one thing it helps this persona do; attribute to Greg; ask if they want it sent. No link. |
| 2 | 4 | Share one concrete, useful insight from inside the resource as a teaser; re-offer to send it. |
| 3 | 5 | Bridge from the resource to a light conversation ("happy to walk you through how this applies to {{company}}"). |
| 4 | 7 | Short final note leaving the resource on the table and the door open, no pressure; re-offer to send it, no link. |

### 4. Authority / Social-proof — `authority-centric`
**Summary:** Lead with credibility: Greg's track record, peer organizations, real results.
**Good for:** a skeptical persona where credibility opens the door.
**Subject:** hint at the credibility or peer result without bragging. Specific beats grand.
**Style rules:**
- Step 1 leads with ONE sharp credibility signal (Greg's 12 exits + book, or peers/results like 150+ ESO partners), then connects it to the reader's goal.
- One proof point, not a stack. Specificity IS the credibility, not adjectives.
- Pivot fast from credibility to what it means for {{company}} so it never reads as a brag.

| Step | Wait | Job |
|---|---|---|
| 1 | 0 | Open with one specific credibility signal; connect to this persona's goal; light ask. |
| 2 | 4 | Name the kind of org like {{company}} that already works with Startup Science and the outcome; re-ask. |
| 3 | 6 | Short, confident invite to see it firsthand with Greg, framed as worth their time. |

### 5. Insight / Provocative — `insight-centric`
**Summary:** Open with a non-obvious observation about their world. Demonstrate expertise before asking.
**Good for:** when you can say something true and counter-intuitive they haven't heard framed this way.
**Subject:** tease the non-obvious idea. Curious, not clickbait.
**Style rules:**
- Step 1 opens with a genuine, specific insight about the persona's industry/role (the Lifecycle "out-of-sequence" thesis fits ESOs and investors well).
- Earn the contrarian moment with substance, never "not X but Y" syntax.
- You're demonstrating you understand their world; the ask is secondary and light.

| Step | Wait | Job |
|---|---|---|
| 1 | 0 | Open with a specific non-obvious observation (use the Lifecycle angle); make it land; light ask to discuss. |
| 2 | 4 | Extend the idea one step with a concrete implication for {{company}}; re-ask. |
| 3 | 6 | Invite them to push back / compare notes with Greg, peer-to-peer. |

### 6. Relevance / Trigger — `trigger-centric`
**Summary:** Reference a specific signal (funding, hire, cohort, news) as why you're reaching out now.
**Good for:** when you have a real, recent trigger for {{company}} that justifies the timing.
**Subject:** reference the trigger directly so timing is the hook. Specific to {{company}}.
**Style rules:**
- Step 1 opens by referencing the trigger (use {{trigger}} or a clearly described signal) and why now is the moment.
- Connect the trigger to the problem Startup Science solves; don't reference it then pivot to something unrelated.
- If no real trigger exists for a recipient, don't use this style — say so rather than fabricate one.

| Step | Wait | Job |
|---|---|---|
| 1 | 0 | Open referencing {{trigger}} for {{company}}; connect to the relevant problem; timely light ask. |
| 2 | 4 | Tie the trigger to a specific outcome Startup Science enables, with one proof point; re-ask. |
| 3 | 6 | Short close respecting the window the trigger created; easiest next step. |

---

## BETA STYLES (lighter skeletons; usable)

### 7. Curiosity / Intrigue — `curiosity-centric`
Short pattern-interrupt that withholds enough to compel a reply. Under 50 words. Honest curiosity — the reply must lead somewhere worth their time.
Steps: (0d) intriguing opener that compels a one-line reply → (4d) reveal one piece, re-invite → (6d) drop the mystery, plain light ask.

### 8. Compliment / Flattery — `compliment-centric`
Open with something genuine and specific about their work, then pivot to the ask within a sentence or two. Never generic flattery.
Steps: (0d) specific genuine compliment about {{company}} + pivot to a light relevant ask → (4d) one useful idea related to what you praised, re-ask → (6d) warm short close.

### 9. Question-centric — `question-centric`
The whole email is one sharp, relevant question. No pitch. The question must be specific and genuinely interesting to them.
Steps: (0d) one well-aimed question, minimal framing → (4d) ask it a different way + why you're asking → (6d) offer to share how others answer it (via Greg).

### 10. Benchmark / Data — `benchmark-centric`
Lead with one specific, credible benchmark and the gap it implies. Follow the number with its implication immediately. Cite the source or use Greg's research — never "studies show."
Steps: (0d) benchmark + gap for this persona, light ask → (4d) a second figure tied to {{company}}, re-ask → (6d) the concrete way to close the gap, easiest next step.

### 11. Peer / FOMO — `peer-fomo-centric`
"Organizations like yours are already doing X." Anchor to peers/competitors. The peer claim must be true — no fake scarcity or invented deadlines.
Steps: (0d) anchor to what orgs like {{company}} are doing with Startup Science, light ask → (4d) name the outcome those peers get + one proof point, re-ask → (6d) confident invite to see it with Greg before the rest of their peer set does.
