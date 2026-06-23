/**
 * Curated lead-magnet library for offer-centric cold email. These are the downloadable
 * assets the GTM team has produced (Greg-authored guides/playbooks/audits). Offer styles
 * pull from this list: the user picks one, or the model selects the best fit for the persona.
 *
 * `personaFit` references EmailPersona.key values (see personas.ts). Edit here to add assets.
 */

export interface LeadMagnet {
  id: string;
  title: string;
  /** One-line hook describing the value, used as the offer line in copy. */
  hook: string;
  /** EmailPersona keys this asset resonates with most. */
  personaFit: string[];
  format: 'Playbook' | 'Guide' | 'Self-Audit' | 'Checklist' | 'Workbook' | 'Briefing' | 'Profile' | 'Rubric';
}

export const LEAD_MAGNETS: LeadMagnet[] = [
  {
    id: 'cohort-operations-playbook',
    title: 'Cohort Operations Playbook',
    hook: 'A step-by-step guide for running startup cohorts: onboarding, curriculum, mentoring, reporting, and engagement.',
    personaFit: ['eso', 'university', 'chamber', 'government'],
    format: 'Playbook',
  },
  {
    id: 'program-funding-guide',
    title: 'Program Funding Guide',
    hook: 'Five revenue streams ESO programs can build to fund themselves sustainably.',
    personaFit: ['eso', 'chamber', 'government'],
    format: 'Guide',
  },
  {
    id: 'five-domains-self-audit',
    title: 'Five Domains Self-Audit',
    hook: 'A founder self-assessment across the five business domains, with the gaps that quietly stall companies.',
    personaFit: ['founder', 'mentor'],
    format: 'Self-Audit',
  },
  {
    id: 'term-sheets-two-force',
    title: 'Term Sheets: The Two-Force Architecture',
    hook: 'A founder\'s field guide to economics and control in a priced round, with a 16-box pre-sign checklist.',
    personaFit: ['founder', 'investor', 'mentor'],
    format: 'Guide',
  },
  {
    id: 'cap-table-dynamics',
    title: 'Cap Table Dynamics',
    hook: 'How dilution, option pools, SAFEs, and the waterfall actually work at three exit prices.',
    personaFit: ['founder', 'investor', 'mentor'],
    format: 'Guide',
  },
  {
    id: 'founders-field-guide-to-investors',
    title: "The Founder's Field Guide to Investors",
    hook: 'How capital thinks: the four investor personas inside every firm and what each one needs to hear.',
    personaFit: ['founder', 'investor'],
    format: 'Guide',
  },
  {
    id: 'optionality-architecture',
    title: 'The Optionality Architecture',
    hook: 'Why most startups fail before they fail, and the architecture of decisions that quietly removes your ability to win.',
    personaFit: ['founder', 'mentor', 'investor'],
    format: 'Guide',
  },
  {
    id: 'board-meeting-playbook',
    title: 'The Board Meeting Playbook',
    hook: 'Run the meeting before the meeting: eight board-member personas and how to walk in with the room already aligned.',
    personaFit: ['founder', 'mentor'],
    format: 'Playbook',
  },
  {
    id: 'nine-dimension-founder-profile',
    title: 'The 9-Dimension Founder Profile',
    hook: 'A print-and-write self-assessment workbook for founders and mentors to surface readiness across nine dimensions.',
    personaFit: ['founder', 'mentor', 'investor'],
    format: 'Workbook',
  },
  {
    id: 'why-you-feel-lost',
    title: 'Why You Feel Lost',
    hook: "A founder's field guide to ecosystem fragmentation and the exhausting work of doing it alone.",
    personaFit: ['founder'],
    format: 'Guide',
  },
  {
    id: 'the-infrastructure-era',
    title: 'The Infrastructure Era',
    hook: 'An executive briefing on why entrepreneurship ate the last 30 years, and what comes next for every comparable sector.',
    personaFit: ['partner', 'provider', 'investor', 'government'],
    format: 'Briefing',
  },
  {
    id: 'seven-stream-revenue-audit',
    title: 'The 7-Stream Revenue Audit',
    hook: 'A board-level audit of the seven revenue streams every ESO can run, scored stream by stream.',
    personaFit: ['eso', 'chamber', 'government'],
    format: 'Self-Audit',
  },
  {
    id: 'selecting-founders-in-the-ai-era',
    title: 'Selecting Founders in the AI Era',
    hook: 'A new selection rubric for when AI broke the application filter and the old signals stopped working.',
    personaFit: ['eso', 'investor', 'university'],
    format: 'Rubric',
  },
];

const MAGNET_BY_ID = new Map(LEAD_MAGNETS.map((m) => [m.id, m]));

export function getLeadMagnet(id: string): LeadMagnet | undefined {
  return MAGNET_BY_ID.get(id);
}

/** Lead magnets that fit a given persona key, best matches first (those that list it). */
export function leadMagnetsForPersona(personaKey?: string): LeadMagnet[] {
  if (!personaKey) return LEAD_MAGNETS;
  const fit = LEAD_MAGNETS.filter((m) => m.personaFit.includes(personaKey));
  return fit.length ? fit : LEAD_MAGNETS;
}
