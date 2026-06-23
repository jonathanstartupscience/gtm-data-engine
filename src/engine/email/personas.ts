/**
 * Cold-email persona library — pain, value, subject angles, and Startup Lifecycle framing
 * per audience. Adapted from the email-composer icp-pain-points reference.
 *
 * `key` is the stable id used by the API and prompt. `presets` are the strings the app's
 * SequenceBuilder persona picker already uses (ESO Leadership, etc.). `icpTypes` ties a
 * persona to the canonical ICP taxonomy Types (see src/engine/icp-taxonomy.ts) so the
 * picker can offer either the human persona or a taxonomy-driven choice.
 */

/** A named, selectable sub-pain — lets the user target a SPECIFIC angle and filter the library by it. */
export interface PersonaPain {
  key: string;
  label: string;
}

export interface EmailPersona {
  key: string;
  name: string;
  /** One-line description shown as a hint in the picker. */
  blurb: string;
  /** What this audience struggles with — the raw material for pain/insight openers. */
  pain: string;
  /** Specific, selectable sub-pains. The user picks one (or types their own) to focus the copy. */
  pains: PersonaPain[];
  /** What Startup Science offers them — the value to land before any ask. */
  value: string;
  /** Subject-line directions the model can riff on (never copy verbatim). */
  subjectAngles: string[];
  /** How the Startup Lifecycle framework speaks to this persona specifically. */
  lifecycleAngle: string;
  /** App persona-preset labels that map to this persona (for the existing picker). */
  presets?: string[];
  /** Canonical ICP taxonomy Types this persona covers. */
  icpTypes?: string[];
}

export const EMAIL_PERSONAS: EmailPersona[] = [
  {
    key: 'founder',
    name: 'Founders',
    blurb: 'Early-stage founders drowning in contradictory advice.',
    pain: 'High failure rates driven by poor sequencing, noise, and inconsistent advice. No clear path, overwhelmed by contradictory guidance.',
    pains: [
      { key: 'contradictory-advice', label: 'Drowning in contradictory advice' },
      { key: 'wrong-order', label: 'Doing the right things in the wrong order' },
      { key: 'no-clear-next-step', label: 'No clear next step / no map' },
      { key: 'chasing-funding', label: 'Chasing funding instead of building what makes it inevitable' },
    ],
    value: 'Clarity, sequencing, execution, and a clear next step. A proven system instead of guesswork.',
    subjectAngles: [
      'The step most founders skip before product-market fit',
      'Why most startup advice is out of order',
    ],
    lifecycleAngle:
      'Most founders are working on the wrong phase for where their company actually is. The Lifecycle tells them which phase they are in and what to do next.',
    presets: ['ESO Founder/GP'],
    icpTypes: ['Startup'],
  },
  {
    key: 'eso',
    name: 'Accelerators & ESOs',
    blurb: 'Accelerator / incubator program leaders and partnerships.',
    pain: 'Outdated tools, inconsistent programming, weak reporting, unclear outcomes. Fragmented tech stack, manual cohort management, no standardized curriculum.',
    pains: [
      { key: 'weak-post-program-outcomes', label: 'Weak outcomes after Demo Day (founders stall later)' },
      { key: 'fragmented-stack', label: 'Fragmented 5-10 tool stack' },
      { key: 'no-standard-curriculum', label: 'No standardized curriculum across cohorts' },
      { key: 'cant-prove-roi', label: "Can't prove ROI / impact to funders" },
      { key: 'manual-cohort-mgmt', label: 'Manual, time-consuming cohort management' },
    ],
    value: 'Cohort readiness, curriculum standardization, mentor alignment, better outcomes. One platform replacing 5-10 tools.',
    subjectAngles: [
      'What your accelerator\'s reporting is missing',
      'How top programs standardize cohort outcomes',
    ],
    lifecycleAngle:
      'ESOs concentrate support at Vision, Product, and Go-to-Market (where Demo Day lives), but companies fail later at Standardization, Optimization, and Growth. Standardized, lifecycle-aware programming closes that gap.',
    presets: ['ESO Leadership', 'ESO Program', 'ESO Partnerships'],
    icpTypes: ['ESO'],
  },
  {
    key: 'university',
    name: 'Universities',
    blurb: 'University entrepreneurship programs and faculty.',
    pain: 'Theory-heavy entrepreneurship programs disconnected from real founder needs. Students graduate without practical execution skills.',
    pains: [
      { key: 'theory-vs-practice', label: 'Theory-heavy, disconnected from real founder needs' },
      { key: 'no-execution-skills', label: 'Students graduate without execution skills' },
      { key: 'outdated-curriculum', label: 'Curriculum lags the real startup world' },
      { key: 'weak-student-outcomes', label: 'Hard to show real student/venture outcomes' },
    ],
    value: 'A modern, applied curriculum built on real startup execution. Student outcomes improve.',
    subjectAngles: [
      'The gap between entrepreneurship courses and founder reality',
      'Applied startup curriculum that produces outcomes',
    ],
    lifecycleAngle:
      'The Lifecycle gives students a real execution map across all seven phases, not just the pitch-deck theory that ends at Demo Day.',
    icpTypes: ['ESO'],
  },
  {
    key: 'investor',
    name: 'Investors',
    blurb: 'VCs, angels, syndicates assessing founder readiness.',
    pain: 'Pitch decks without real execution data or lifecycle signals. Hard to assess founder readiness beyond gut feel.',
    pains: [
      { key: 'gut-feel-diligence', label: 'Assessing founders on gut feel, not signal' },
      { key: 'pitch-deck-blind-spot', label: 'Pitch decks hide execution risk' },
      { key: 'fundable-not-durable', label: 'Backing fundable founders who aren\'t durable' },
      { key: 'portfolio-support-gap', label: 'No structured way to support portfolio post-investment' },
    ],
    value: 'Better-prepared founders with lifecycle-aligned KPIs and execution signals. Reduced risk.',
    subjectAngles: [
      'Beyond the pitch deck: what actually predicts founder success',
      'Lifecycle signals that separate ready founders from risky bets',
    ],
    lifecycleAngle:
      'Phase tells you whether a founder is fundable AND durable. Most diligence measures fundability and misses durability, which is where the loss happens.',
    icpTypes: ['Investor'],
  },
  {
    key: 'provider',
    name: 'Service & Software Providers',
    blurb: 'Companies selling tools/services to startups.',
    pain: 'High CAC, poor timing, weak attribution, fragmented distribution. Hard to reach founders at the right moment.',
    pains: [
      { key: 'high-cac', label: 'High CAC reaching founders' },
      { key: 'wrong-timing', label: 'Reaching founders at the wrong moment' },
      { key: 'weak-attribution', label: 'Weak attribution / can\'t prove what works' },
      { key: 'fragmented-distribution', label: 'Fragmented distribution, no single channel' },
    ],
    value: 'Lifecycle-timed reach, lower CAC, attribution, and API integrations. Reach founders when they need you.',
    subjectAngles: [
      'Why your startup marketing has a timing problem',
      'Reaching founders at the moment they need your tool',
    ],
    lifecycleAngle:
      'A founder buys different things in different phases. Knowing the phase is the difference between a timely offer and noise.',
    icpTypes: ['Provider', 'Vendor'],
  },
  {
    key: 'chamber',
    name: 'Associations & Chambers',
    blurb: 'Chambers of commerce and business associations.',
    pain: 'Limited programming capacity. Difficulty demonstrating member value. Inconsistent support quality.',
    pains: [
      { key: 'limited-capacity', label: 'Limited programming capacity / small team' },
      { key: 'prove-member-value', label: 'Hard to demonstrate member value' },
      { key: 'inconsistent-support', label: 'Inconsistent quality of founder support' },
    ],
    value: 'Scalable programming, member value, regional economic outcomes. Serve more founders without more staff.',
    subjectAngles: ['How chambers are scaling founder support without scaling headcount'],
    lifecycleAngle:
      'A shared lifecycle framework lets a small team deliver consistent, high-quality support to founders at every phase.',
    icpTypes: ['ESO'],
  },
  {
    key: 'government',
    name: 'Government Programs',
    blurb: 'Economic-development and public startup programs.',
    pain: 'Difficulty measuring economic development impact. Programs lack standardization. Hard to justify continued funding.',
    pains: [
      { key: 'cant-measure-impact', label: 'Hard to measure economic-development impact' },
      { key: 'no-standardization', label: 'Programs lack standardization' },
      { key: 'justify-funding', label: 'Hard to justify continued funding' },
    ],
    value: 'Measurable outcomes, standardized programming, clear reporting for stakeholders.',
    subjectAngles: ['Measuring what your startup program actually produces'],
    lifecycleAngle:
      'Lifecycle phases turn fuzzy program impact into measurable progression you can report to the people who fund you.',
    icpTypes: ['ESO'],
  },
  {
    key: 'mentor',
    name: 'Mentors & Advisors',
    blurb: 'Startup mentors and advisors.',
    pain: 'Unstructured sessions, unclear founder readiness, wasted time on misaligned mentoring.',
    pains: [
      { key: 'unstructured-sessions', label: 'Unstructured sessions, no context going in' },
      { key: 'unclear-readiness', label: 'Unclear where the founder actually is' },
      { key: 'advice-wrong-phase', label: 'Great advice landing at the wrong phase' },
    ],
    value: 'Structured context before every session. Higher-value conversations. Clear alignment with founder lifecycle stage.',
    subjectAngles: ['Why your best mentoring advice might be landing at the wrong time'],
    lifecycleAngle:
      'Advice that is right for one phase is wrong for another. Knowing the founder\'s phase before the session is what makes the hour count.',
    icpTypes: ['Mentor'],
  },
  {
    key: 'partner',
    name: 'Partners',
    blurb: 'Strategic / corporate / technology partners.',
    pain: 'No shared infrastructure to integrate into. Limited distribution reach. Disconnected from founder workflows.',
    pains: [
      { key: 'no-shared-infrastructure', label: 'No shared infrastructure to integrate into' },
      { key: 'limited-distribution', label: 'Limited distribution reach to founders' },
      { key: 'disconnected-workflows', label: 'Disconnected from founder workflows' },
    ],
    value: 'Shared infrastructure, distribution, and deeper integration into the ecosystem.',
    subjectAngles: ['The infrastructure layer the startup ecosystem has been missing'],
    lifecycleAngle:
      'The Lifecycle is the shared language and infrastructure a partner plugs into, instead of bolting onto disconnected workflows.',
    icpTypes: ['Partner'],
  },
];

const PERSONA_BY_KEY = new Map(EMAIL_PERSONAS.map((p) => [p.key, p]));

export function getEmailPersona(key: string): EmailPersona | undefined {
  return PERSONA_BY_KEY.get(key);
}

/**
 * Resolve a pain selection for a persona to a human label. Accepts a curated pain key OR a
 * free-text custom pain (which wins if provided). Returns null when neither is set.
 */
export function resolvePain(persona: EmailPersona | undefined, painKey?: string, painCustom?: string): { key: string; label: string } | null {
  const custom = painCustom?.trim();
  if (custom) return { key: 'custom', label: custom };
  if (!painKey || !persona) return null;
  const found = persona.pains.find((p) => p.key === painKey);
  return found ? { key: found.key, label: found.label } : null;
}

/** Resolve a free-text persona/preset/type string to a persona (best-effort). */
export function resolveEmailPersona(input?: string): EmailPersona | undefined {
  if (!input) return undefined;
  const norm = input.trim().toLowerCase();
  return (
    EMAIL_PERSONAS.find((p) => p.key === norm) ||
    EMAIL_PERSONAS.find((p) => p.name.toLowerCase() === norm) ||
    EMAIL_PERSONAS.find((p) => p.presets?.some((pre) => pre.toLowerCase() === norm)) ||
    EMAIL_PERSONAS.find((p) => p.icpTypes?.some((t) => t.toLowerCase() === norm))
  );
}
