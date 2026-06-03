/**
 * Persona classification — ported from the ESO run's persona.py (incl. the
 * word-boundary fixes for short tokens like ceo/coo/gp/bd so "coo" doesn't match
 * inside "program coordinator"). One persona per contact; precedence:
 * Leadership > Program > Partnerships > Founder. Returns null for non-buyers.
 */

export type Persona = 'ESO Leadership' | 'ESO Program' | 'ESO Partnerships' | 'ESO Founder/GP';

const PERSONA_KEYWORDS: [Persona, string[]][] = [
  ['ESO Leadership', [
    'executive director', 'ceo', 'chief executive', 'president', 'managing director',
    'founder & ceo', 'chief operating officer', 'coo', 'general manager', 'head of the org',
  ]],
  ['ESO Program', [
    'program director', 'program manager', 'program lead', 'cohort', 'accelerator director',
    'accelerator manager', 'incubator director', 'incubator manager', 'portfolio director',
    'portfolio manager', 'venture services', 'director of programs', 'head of programs',
    'entrepreneurship director', 'startup programs', 'founder programs', 'program coordinator',
  ]],
  ['ESO Partnerships', [
    'partnerships', 'partner manager', 'business development', 'bd', 'ecosystem',
    'community manager', 'community director', 'head of community', 'strategic partnerships',
    'corporate relations', 'sponsorship', 'membership director',
  ]],
  ['ESO Founder/GP', [
    'founder', 'co-founder', 'managing partner', 'general partner', 'gp', 'principal',
  ]],
];

const EXCLUDE = ['student', 'intern', 'alumni', 'retired', 'assistant', 'volunteer', 'mentor', 'member'];

const WORD_BOUNDARY = new Set([
  'ceo', 'coo', 'gp', 'bd', 'president', 'principal', 'gm', 'founder', 'co-founder',
  'cohort', 'ecosystem', 'sponsorship', 'general manager', 'managing director',
]);

const wb = (kw: string, text: string) =>
  new RegExp(`(?<![a-z])${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`).test(text);

function matches(kw: string, text: string): boolean {
  if (WORD_BOUNDARY.has(kw) || kw.length <= 3) return wb(kw, text);
  return text.includes(kw);
}

export function classifyPersona(jobTitle: string | null | undefined): Persona | null {
  if (!jobTitle) return null;
  const t = jobTitle.toLowerCase().trim();
  const isProgramCoord = t.includes('program coordinator');

  for (const bad of EXCLUDE) {
    if (wb(bad, t)) {
      if (bad === 'mentor' && t.includes('program')) continue;
      return null;
    }
  }
  if (t.includes('coordinator') && !isProgramCoord) return null;

  if (/\bdirector of community\b/.test(t) || /\bdirector,? community\b/.test(t)) {
    return 'ESO Partnerships';
  }

  for (const [persona, kws] of PERSONA_KEYWORDS) {
    for (const kw of kws) if (matches(kw, t)) return persona;
  }
  return null;
}
