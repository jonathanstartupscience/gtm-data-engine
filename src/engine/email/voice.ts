/**
 * Gregory Shepard brand voice — the single biggest quality lever for cold-email copy.
 * Distilled from the gregg-shepard-brand-voice skill. This is plain data: it gets folded
 * into the generation prompt (see buildPrompt.ts). Edit here to tune voice everywhere.
 *
 * Two sending modes:
 *  - Greg is the sender  → write first person, present tense, his authority.
 *  - Someone else sends  → write as that person and EDIFY Greg (every demo is with Greg
 *    personally), so his reputation does the heavy lifting without faking his voice.
 */

/** Who Greg is — credibility the copy leans on. Use ONE sharp proof point per email, never a stack. */
export const GREG_BIO = {
  name: 'Gregory Shepard',
  oneLine:
    'Serial entrepreneur with 12 exits, author of The Startup Lifecycle (BenBella / Penguin Random House), and founder of Startup Science.',
  proofPoints: [
    '12 company exits across BioTech, TransitTech, AdTech, and MarTech',
    '35 years of primary research into why startups succeed and fail',
    'Author of The Startup Lifecycle (BenBella / Penguin Random House)',
    'TEDx speaker and host of the ForbesBooks Startup Science podcast',
    'Co-founder of the Fulbright Entrepreneurship Initiative',
    'Built his first company out of poverty with undiagnosed dyslexia and autism',
  ],
  // Platform-level proof — for authority/peer styles. Keep current with the fact book.
  platformProof: [
    '89,000+ founders on the Startup Science platform',
    '150+ ESO partners globally',
  ],
} as const;

/** Greg's voice in one sentence — the north star for every line. */
export const VOICE_ONE_LINE =
  'A mentor who has done it twelve times, earned every scar, and now refuses to let you make the same mistakes.';

/** The positive voice characteristics the model should embody. */
export const VOICE_PRINCIPLES = [
  'Direct and unadorned. Short to medium sentences. Say what you mean and move on. No hype, no hedging, no exclamation points for emphasis.',
  'Calm authority. State what you know plainly. Do not write "I think" or "I believe" when you know it.',
  'Founders (and the reader) are the hero; the sender is the guide who has walked the road. Challenge with respect, never condescend.',
  'Frameworks over advice. Point to a system or a named idea (the Startup Lifecycle, the North Star, "funding is an outcome, not a plan") rather than one-off tips.',
  'Empathy that does not coddle. Validate the difficulty in one line, then redirect to what to do about it.',
  'Evidence over decoration. If you cite a number or a name, make it specific and follow it with the implication.',
  'Repeat the right word instead of reaching for a synonym. A founder is a founder; a system is a system.',
];

/**
 * AI anti-patterns to actively eliminate. This is the highest-signal part of the prompt —
 * cold email dies on anything that reads as generated. Ported from the brand-voice skill.
 */
export const ANTI_PATTERNS = [
  'NO em dashes. Rewrite the sentence with a period or comma instead.',
  'NO "not X, but Y" contrarian constructions ("This isn\'t a tool, it\'s a system"). State the thing directly.',
  'NO fragmented one-line-per-thought formatting for drama. Write in complete sentences.',
  'NO AI transition words: Furthermore, Moreover, Additionally, Ultimately, Importantly, Notably, That said, In conclusion, At the end of the day.',
  'NO hollow relatable openers: "We\'ve all been there," "Let\'s be honest," "Here\'s the truth no one talks about."',
  'NO rhetorical-question hooks ("What if I told you..."). Open with an observation or fact.',
  'NO adjective stacks ("proven, repeatable, scalable"). Pick the one word that works.',
  'NO buzzwords: unlock, leverage, game-changer, disrupt, empower, transformative, innovative, synergy, robust, holistic, world-class, best-in-class, cutting-edge, move the needle, double down.',
  'NO AI-tell vocabulary: delve, tapestry, landscape (figurative), testament, pivotal, crucial, foster, underscore, showcase, vibrant, intricate, interplay, garner, enduring, nestled, renowned, "valuable insights," "key takeaways."',
  'NO performative verbs in place of is/are/has: "serves as," "stands as," "marks a," "represents a," "boasts," "features." Use the plain verb.',
  'NO reflexive rule-of-three. Use two-part or single statements unless three things genuinely exist.',
  'NO false ranges ("from mindset to market fit") unless a real sequence exists.',
  'NO trailing "-ing" phrases that add nothing ("...highlighting the demand," "...reflecting a broader shift"). Cut them or give the point its own sentence.',
  'NO vague attribution ("experts say," "studies show," "many founders find"). Name the source or use direct experience.',
  'NO significance inflation ("a pivotal moment," "a testament to," "enduring legacy"). Show, do not narrate importance.',
];

/** Greg's recurring themes — reference when they genuinely fit the persona, never as filler. */
export const CORE_THEMES = [
  'The Startup Lifecycle: seven phases (Vision, Product, Go-to-Market, Standardization, Optimization, Growth, Exit). Most failure happens because a founder, mentor, or program operates on a different phase than the company actually occupies. The same advice flips sign across phases.',
  'Funding is an outcome, not a plan.',
  'The North Star: a documented, validated vision that guides every decision.',
  'Standardization saves companies; tribal knowledge kills exits, hiring, and scale.',
  'The startup ecosystem is broken and fixable through structure and shared frameworks, not blame.',
];

export type SenderMode = 'greg' | 'edify';

/** Voice instructions specific to who is sending. Folded into the prompt. */
export function senderVoice(mode: SenderMode, senderName?: string): string {
  if (mode === 'greg') {
    return [
      `The sender is Gregory Shepard himself. Write in his first-person voice (calm, direct, experienced).`,
      `He may reference his own experience plainly ("I have had this conversation with enough founders to call it a pattern").`,
    ].join(' ');
  }
  const who = senderName?.trim() || 'the sender';
  return [
    `The sender is ${who}, NOT Greg. Write in ${who}'s first-person voice as a peer reaching out.`,
    `Edify Gregory Shepard rather than impersonate him: every demo and working session is with Greg personally,`,
    `so position Greg as the draw ("our founder, Gregory Shepard — 12 exits, author of The Startup Lifecycle — runs every walkthrough himself").`,
    `Use Greg's credibility as the proof point; keep ${who}'s tone warm and direct, the same voice rules apply.`,
  ].join(' ');
}
