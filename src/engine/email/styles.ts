/**
 * Cold-email STYLE library — the standardized strategy layer. A style is a fixed strategic
 * skeleton (how many steps, what each step's job is, the structural rules). The model writes
 * the actual copy per persona; the skeleton keeps strategy consistent and repeatable.
 *
 * Add a style by appending to COLD_EMAIL_STYLES. `status: 'core'` styles are fully tuned and
 * shipped; `status: 'beta'` styles are lighter data stubs that still generate but are less
 * battle-tested. The interface is identical, so promoting a beta style is just editing data.
 */

export interface StyleStep {
  /** 1-based position in the sequence. */
  order: number;
  /** Default days to wait before sending this step (step 1 is always 0). */
  waitDays: number;
  /** Short label shown in the UI step plan, e.g. "Pain + consequence opener". */
  label: string;
  /** The JOB of this step — fed to the model as the instruction for what this email must do. */
  job: string;
}

export interface ColdEmailStyle {
  key: string;
  name: string;
  status: 'core' | 'beta';
  /** One-line summary for the picker. */
  summary: string;
  /** When this style is the right choice (shown as a hint). */
  whenToUse: string;
  /** Whether this style centers on a lead-magnet offer (enables the offer picker). */
  supportsOffer: boolean;
  /** Subject-line guidance specific to this style. */
  subjectGuidance: string;
  /** Style-specific structural rules layered on top of the shared rules. */
  rules: string[];
  /** The step-by-step skeleton the model must follow. */
  steps: StyleStep[];
}

/** Rules every style inherits — the house style for all cold email. */
export const SHARED_RULES = [
  'Keep each email under ~90 words. Shorter is better. Respect the reader\'s inbox time.',
  'Exactly one call to action per email, and make it low-friction ("Worth a quick look?" beats "Can we book a 30-minute discovery call?").',
  'Personalize with Bison merge tags only, in single-brace UPPERCASE: {FIRST_NAME}, {COMPANY}, {TITLE}, {LAST_NAME}. Same copy ships to the whole segment, so never assume a fact you cannot get from a tag.',
  'Lead with the reader\'s world, not ours. The first sentence is about them or their problem, not about us.',
  'One sharp proof point beats three hedged claims. Use Greg\'s credibility as the proof, not a list of features.',
  'Do NOT write a sign-off or signature. The sending inbox injects the sender\'s name and signature automatically — a sign-off in the copy double-signs the email. End on the CTA or last content line.',
  'Later steps in a thread are short follow-ups that add a new angle or a lighter ask, never a guilt trip ("just bumping this," "did you see my last email" are banned).',
  'FORMAT the body for a phone screen: break it into 1-2 sentence beats separated by a blank line, so the email is 2-3 short blocks. Never ship one dense paragraph. (The Three-Paragraph / Khare style keeps its explicit three-paragraph form.)',
];

export const COLD_EMAIL_STYLES: ColdEmailStyle[] = [
  {
    key: 'michelle-3-paragraph',
    name: 'Three-Paragraph (Khare method)',
    status: 'core',
    summary: 'Tight three-paragraph email: who you are + the ask, the shared vision, a frictionless CTA.',
    whenToUse: 'A clean, high-signal first touch when you have done your homework and want a fast yes/no.',
    supportsOffer: false,
    subjectGuidance:
      'The subject must signal value to the reader in a few words — enough for them to see what is in it for them. No clever wordplay.',
    rules: [
      'Body is exactly three short paragraphs.',
      'Paragraph 1: two sentences. First, who the sender is, with legitimacy in a single sentence (lean on Greg). Second, what you are asking for or offering (ideally both).',
      'Paragraph 2: two sentences or less. A window into the vision you hope to build together and a peek at what you might need, written so it is obvious you did your homework on {COMPANY}.',
      'Paragraph 3: two sentences or less. The CTA. Make replying effortless ("Reply with a time that works and I will send an invite"). Remove the awkward entry cost of responding to a stranger.',
    ],
    steps: [
      { order: 1, waitDays: 0, label: 'Three-paragraph intro', job: 'The full three-paragraph email: legitimacy + ask, shared vision + homework, frictionless CTA.' },
      { order: 2, waitDays: 4, label: 'Soft follow-up', job: 'A 2-3 sentence follow-up that adds one new specific reason this matters for {COMPANY} and repeats the easy CTA. Not a bump.' },
      { order: 3, waitDays: 6, label: 'Value add + close', job: 'A short final note offering one concrete thing (a relevant idea or resource) and a graceful close that invites a reply whenever the timing is right.' },
    ],
  },
  {
    key: 'pain-centric',
    name: 'Pain / Problem-centric',
    status: 'core',
    summary: 'Open on a specific pain and its downstream consequence, then offer a way out.',
    whenToUse: 'When the persona has a sharp, nameable problem you can articulate better than they can.',
    supportsOffer: false,
    subjectGuidance:
      'Name the problem or its consequence in the subject, specific to the persona. Not a benefit claim.',
    rules: [
      'Step 1 opens by naming a specific pain the persona feels AND the downstream consequence (what it costs, breaks, or prevents).',
      'Include a soft disqualifier so it does not read as a generic blast ("This may not be true for your program, but...").',
      'Only after the pain lands do you hint at the path out. Do not pitch features.',
    ],
    steps: [
      { order: 1, waitDays: 0, label: 'Pain + consequence opener', job: 'Name one specific pain for this persona and the consequence it creates, with a soft disqualifier, then a one-line path out and a low-friction CTA.' },
      { order: 2, waitDays: 4, label: 'Proof nudge', job: 'Add one concrete proof point (a result, a peer, or Greg\'s credibility) that the path out is real, and repeat the easy ask.' },
      { order: 3, waitDays: 5, label: 'Reframe the cost', job: 'Reframe the cost of leaving the problem unsolved in a new way, tied to {COMPANY}, and offer the lightest possible next step.' },
      { order: 4, waitDays: 7, label: 'Graceful close', job: 'A brief breakup note that leaves the door open and removes pressure, with one final relevant line of value.' },
    ],
  },
  {
    key: 'offer-centric',
    name: 'Offer-centric (lead magnet)',
    status: 'core',
    summary: 'Lead with a valuable, relevant resource. Give before you ask.',
    whenToUse: 'When you have a lead magnet that fits the persona and want to open a relationship by giving value.',
    supportsOffer: true,
    subjectGuidance:
      'Reference the asset and its payoff for the persona. Make the value obvious and specific.',
    rules: [
      'Step 1 leads with the offered resource and the single most useful thing the reader gets from it. The ask is just "want me to send it?" or a direct link.',
      'The offer is genuinely free and useful; no bait-and-switch into a hard pitch.',
      'Tie the resource to the persona\'s actual problem so it does not read as generic content marketing.',
      'Greg authored these; attribute the resource to him to carry authority.',
    ],
    steps: [
      { order: 1, waitDays: 0, label: 'Lead with the offer', job: 'Open with the lead magnet and the one thing it helps this persona do, attribute it to Greg, and make accepting it frictionless.' },
      { order: 2, waitDays: 4, label: 'One insight from the asset', job: 'Share one concrete, useful insight from inside the resource as a teaser, then re-offer it.' },
      { order: 3, waitDays: 5, label: 'Bridge to a conversation', job: 'Bridge from the resource to a light conversation ("happy to walk you through how this applies to {COMPANY}"), still low-friction.' },
      { order: 4, waitDays: 7, label: 'Graceful close', job: 'A short final note that leaves the resource on the table and the door open, no pressure.' },
    ],
  },
  {
    key: 'authority-centric',
    name: 'Authority / Social-proof',
    status: 'core',
    summary: 'Lead with credibility: Greg\'s track record, peer organizations, real results.',
    whenToUse: 'When the persona is skeptical of unknown senders and credibility opens the door.',
    supportsOffer: false,
    subjectGuidance:
      'Hint at the credibility or the peer result without bragging. Specific beats grand.',
    rules: [
      'Step 1 leads with one sharp credibility signal (Greg\'s 12 exits and book, or peers/results like 150+ ESO partners), then connects it to the reader\'s goal.',
      'Use ONE proof point, not a stack. Specificity is the credibility, not adjectives.',
      'Pivot quickly from credibility to what it means for {COMPANY} so it never reads as a brag.',
    ],
    steps: [
      { order: 1, waitDays: 0, label: 'Credibility hook', job: 'Open with one specific credibility signal (Greg\'s record or a peer result), connect it to this persona\'s goal, and make a light ask.' },
      { order: 2, waitDays: 4, label: 'Peer proof', job: 'Name the kind of organization like {COMPANY} that already works with Startup Science and the outcome, then re-ask.' },
      { order: 3, waitDays: 6, label: 'Direct invite', job: 'A short, confident invite to see it firsthand with Greg, framed as worth their time, low-friction.' },
    ],
  },
  {
    key: 'insight-centric',
    name: 'Insight / Provocative',
    status: 'core',
    summary: 'Open with a non-obvious observation about their world. Demonstrate expertise before asking.',
    whenToUse: 'When you can say something true and counter-intuitive the persona has not heard framed this way.',
    supportsOffer: false,
    subjectGuidance:
      'Tease the non-obvious idea. Make them curious enough to read the first line, without clickbait.',
    rules: [
      'Step 1 opens with a genuine, specific insight about the persona\'s industry or role (the Lifecycle "out-of-sequence" thesis fits ESOs and investors well).',
      'Earn the contrarian moment with substance, never with "not X but Y" syntax.',
      'You are demonstrating you understand their world; the ask is secondary and light.',
    ],
    steps: [
      { order: 1, waitDays: 0, label: 'Provocative insight', job: 'Open with a specific non-obvious observation about this persona\'s world (use the Lifecycle angle), make it land, then a light ask to discuss.' },
      { order: 2, waitDays: 4, label: 'Extend the insight', job: 'Extend the idea one step further with a concrete implication for {COMPANY}, and re-ask.' },
      { order: 3, waitDays: 6, label: 'Invite the debate', job: 'Invite them to push back or compare notes with Greg, framed as a peer conversation, low-friction.' },
    ],
  },
  {
    key: 'trigger-centric',
    name: 'Relevance / Trigger',
    status: 'core',
    summary: 'Reference a specific signal (funding, hire, cohort, news) as the reason you are reaching out now.',
    whenToUse: 'When you have a real, recent trigger for {COMPANY} that justifies the timing.',
    supportsOffer: false,
    subjectGuidance:
      'Reference the trigger directly so the timing is the hook. Specific to {COMPANY}.',
    rules: [
      'Step 1 opens by referencing the trigger (use a {TRIGGER} merge tag or a clearly described signal type) and why it makes now the right moment.',
      'Connect the trigger to the problem Startup Science solves; do not reference the trigger and then pivot to something unrelated.',
      'If no real trigger exists for a recipient, this style should not be used — say so rather than fabricate one.',
    ],
    steps: [
      { order: 1, waitDays: 0, label: 'Trigger + why now', job: 'Open by referencing the trigger for {COMPANY}, connect it to the relevant problem, and make a timely, light ask.' },
      { order: 2, waitDays: 4, label: 'Connect to outcome', job: 'Tie the trigger to a specific outcome Startup Science enables, with one proof point, then re-ask.' },
      { order: 3, waitDays: 6, label: 'Time-bound close', job: 'A short close that respects the window the trigger created and offers the easiest next step.' },
    ],
  },

  // ---- Beta styles: lighter skeletons, still generate. Promote to 'core' once tuned. ----
  {
    key: 'curiosity-centric',
    name: 'Curiosity / Intrigue',
    status: 'beta',
    summary: 'Short pattern-interrupt that withholds enough to compel a reply.',
    whenToUse: 'High-volume top-of-funnel where a low-information, high-curiosity opener earns the reply.',
    supportsOffer: false,
    subjectGuidance: 'Open a curiosity gap honestly. No clickbait you cannot pay off.',
    rules: [
      'Very short (under 50 words). Withhold the specifics but promise they are real and relevant.',
      'The curiosity must be honest — the reply must lead somewhere worth their time.',
    ],
    steps: [
      { order: 1, waitDays: 0, label: 'Pattern interrupt', job: 'A very short, intriguing opener tied to this persona that compels a one-line reply.' },
      { order: 2, waitDays: 4, label: 'Reveal a little', job: 'Reveal one piece of the intrigue and re-invite the reply.' },
      { order: 3, waitDays: 6, label: 'Make the ask plain', job: 'Drop the mystery and make a plain, light ask.' },
    ],
  },
  {
    key: 'compliment-centric',
    name: 'Compliment / Flattery',
    status: 'beta',
    summary: 'Open with something genuine about their work, then pivot to the ask.',
    whenToUse: 'When there is a real, specific thing to praise (a program, a talk, a result).',
    supportsOffer: false,
    subjectGuidance: 'Reference the specific thing you admire. Genuine, not gushing.',
    rules: [
      'The compliment must be specific and true, never generic flattery.',
      'Pivot from the compliment to a relevant, light ask within a sentence or two.',
    ],
    steps: [
      { order: 1, waitDays: 0, label: 'Genuine compliment + pivot', job: 'Open with a specific genuine compliment about {COMPANY}\'s work and pivot to a light, relevant ask.' },
      { order: 2, waitDays: 4, label: 'Add value', job: 'Follow up with one useful idea related to what you praised, and re-ask.' },
      { order: 3, waitDays: 6, label: 'Graceful close', job: 'A short, warm close that leaves the door open.' },
    ],
  },
  {
    key: 'question-centric',
    name: 'Question-centric',
    status: 'beta',
    summary: 'The whole email is a single relevant question. No pitch, just an opener for dialogue.',
    whenToUse: 'When a sharp question about their world is more compelling than any statement.',
    supportsOffer: false,
    subjectGuidance: 'Pose or hint at the question. Make it one they would actually want to answer.',
    rules: [
      'Step 1 is essentially one well-aimed question relevant to the persona, with minimal framing and no pitch.',
      'The question must be specific and genuinely interesting to them, not a pitch in disguise.',
    ],
    steps: [
      { order: 1, waitDays: 0, label: 'The question', job: 'A short email built around one sharp, relevant question for this persona. No pitch.' },
      { order: 2, waitDays: 4, label: 'Reframe the question', job: 'Ask the question a different way and add why you are asking, lightly tied to Startup Science.' },
      { order: 3, waitDays: 6, label: 'Offer your answer', job: 'Offer to share how others answer it (via Greg), as the light ask.' },
    ],
  },
  {
    key: 'benchmark-centric',
    name: 'Benchmark / Data',
    status: 'beta',
    summary: 'Lead with a stat or benchmark that creates contrast between what they have and what is possible.',
    whenToUse: 'When a credible number reframes the persona\'s situation.',
    supportsOffer: false,
    subjectGuidance: 'Put the contrast or the number in the subject. Specific and credible.',
    rules: [
      'Step 1 leads with one specific, credible benchmark and the gap it implies for the reader.',
      'Follow the number with its implication immediately. Cite the source or use Greg\'s research; never "studies show."',
    ],
    steps: [
      { order: 1, waitDays: 0, label: 'Benchmark + gap', job: 'Open with one credible benchmark and the gap it implies for this persona, then a light ask.' },
      { order: 2, waitDays: 4, label: 'Second data point', job: 'Add a second supporting figure tied to {COMPANY}\'s situation and re-ask.' },
      { order: 3, waitDays: 6, label: 'Close the gap', job: 'Offer the concrete way to close the gap, with the easiest next step.' },
    ],
  },
  {
    key: 'peer-fomo-centric',
    name: 'Peer / FOMO',
    status: 'beta',
    summary: '"Organizations like yours are already doing X." Anchors to peers and competitors.',
    whenToUse: 'When peer adoption is real and the persona cares what comparable organizations do.',
    supportsOffer: false,
    subjectGuidance: 'Reference the peer movement honestly. No fake scarcity.',
    rules: [
      'Step 1 anchors to what comparable organizations are already doing, specific to the persona\'s category.',
      'The peer claim must be true. No invented scarcity or fake deadlines.',
    ],
    steps: [
      { order: 1, waitDays: 0, label: 'Peer anchor', job: 'Open by anchoring to what organizations like {COMPANY} are already doing with Startup Science, then a light ask.' },
      { order: 2, waitDays: 4, label: 'Name the outcome', job: 'Name the outcome those peers are getting, with one proof point, and re-ask.' },
      { order: 3, waitDays: 6, label: 'Invite to join', job: 'A short, confident invite to see it with Greg before the rest of their cohort of peers does.' },
    ],
  },
];

const STYLE_BY_KEY = new Map(COLD_EMAIL_STYLES.map((s) => [s.key, s]));

export function getStyle(key: string): ColdEmailStyle | undefined {
  return STYLE_BY_KEY.get(key);
}
