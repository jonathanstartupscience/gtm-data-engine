/**
 * Classify stage — propose type/sub_type for companies missing them.
 * Signal: Ocean enrich data + homepage text. Brain: an LLM (local `claude -p` for $0, or an
 * API later). Output goes to the classify_proposals REVIEW QUEUE — never auto-applied.
 *
 * The LLM call is injected (classifyFn) so the brain is swappable: CLI uses claude -p,
 * the app can pass an API-backed function. This file has no API key dependency.
 */
import { and, eq, isNull, isNotNull, ne, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies, classifyProposals } from '../../db/schema.js';
import { getTaxonomy, typeLabel } from '../taxonomy.js';
import { enrichCompany } from '../adapters/ocean.js';

export interface ClassifyInput {
  name: string; domain: string;
  oceanDescription?: string; oceanIndustries?: string[]; oceanKeywords?: string[];
  homepageText?: string;
  validTypes: string[];           // labels, e.g. ['ESO','Partner',...]
  validSubTypes: string[];        // all known sub-types
}
export interface ClassifyOutput { type: string; subType: string; confidence: number; reason: string }

/** Companies missing type OR sub_type (with a domain to read). */
export async function companiesMissingTaxonomy(limit = 5000) {
  return db.select({ id: companies.id, name: companies.name, domain: companies.domain })
    .from(companies)
    .where(and(
      isNotNull(companies.domain), ne(companies.domain, ''),
      or(isNull(companies.type), eq(companies.type, ''), isNull(companies.subType), eq(companies.subType, '')),
    ))
    .limit(limit);
}

/** Fetch a homepage and reduce to plain visible text (best-effort; never throws). */
export async function homepageText(domain: string, maxChars = 4000): Promise<string> {
  const url = /^https?:\/\//.test(domain) ? domain : `https://${domain}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (GTM-Engine)' } });
    clearTimeout(timer);
    if (!r.ok) return '';
    const html = await r.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ')
      .trim().slice(0, maxChars);
  } catch { return ''; }
}

/** Build the classification prompt (taxonomy-constrained, asks for confidence + reason JSON). */
export function buildPrompt(i: ClassifyInput): string {
  return [
    'You classify a company into our CRM taxonomy. Respond with ONLY a JSON object:',
    '{"type": <one of the types>, "subType": <one of the sub-types>, "confidence": <0..1>, "reason": <short>}',
    `Valid types: ${i.validTypes.join(', ')}`,
    `Valid sub-types: ${i.validSubTypes.join(', ')}`,
    'If the evidence is weak, give a low confidence. Do not invent values outside the lists.',
    '',
    `Company: ${i.name} (${i.domain})`,
    i.oceanDescription ? `Description: ${i.oceanDescription}` : '',
    i.oceanIndustries?.length ? `Industries: ${i.oceanIndustries.join(', ')}` : '',
    i.oceanKeywords?.length ? `Keywords: ${i.oceanKeywords.slice(0, 15).join(', ')}` : '',
    i.homepageText ? `Homepage text: ${i.homepageText}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Classify a batch of companies and write proposals to the review queue.
 * `classifyFn` is the swappable LLM brain (CLI claude -p, or API).
 */
export async function classifyCompanies(
  classifyFn: (prompt: string) => Promise<ClassifyOutput | null>,
  opts: { limit?: number; useHomepage?: boolean; oceanFallback?: boolean } = {},
  log: (m: string) => void = console.log,
): Promise<{ attempted: number; proposed: number; errors: number; oceanCalls: number }> {
  const tax = await getTaxonomy();
  const validTypes = [...new Set(tax.map((t) => t.label))];
  const validSubTypes = [...new Set(tax.flatMap((t) => t.subTypes.map((s) => s.value)))];
  const targets = await companiesMissingTaxonomy(opts.limit ?? 1000);
  log(`${targets.length} companies missing type/sub-type`);
  let proposed = 0, errors = 0, oceanCalls = 0;

  for (let idx = 0; idx < targets.length; idx++) {
    const c = targets[idx];
    try {
      // PRIMARY signal: homepage (free). Ocean is OFF by default — cost-sensitive.
      const homepage = opts.useHomepage !== false ? await homepageText(c.domain!) : '';

      // Ocean ONLY as an explicit fallback when the homepage yielded too little signal.
      let oceanDescription: string | undefined, oceanIndustries: string[] | undefined, oceanKeywords: string[] | undefined;
      if (opts.oceanFallback && homepage.length < 200) {
        try {
          const o = await enrichCompany(c.domain!) as Record<string, unknown>;
          oceanCalls++;
          oceanDescription = typeof o.description === 'string' ? o.description : undefined;
          oceanIndustries = Array.isArray(o.industries) ? o.industries as string[] : undefined;
          oceanKeywords = Array.isArray(o.keywords) ? o.keywords as string[] : undefined;
        } catch { /* Ocean optional */ }
      }

      const out = await classifyFn(buildPrompt({
        name: c.name ?? c.domain!, domain: c.domain!,
        oceanDescription, oceanIndustries, oceanKeywords, homepageText: homepage,
        validTypes, validSubTypes,
      }));
      if (!out) { errors++; continue; }

      const signal = [oceanDescription || oceanIndustries ? 'ocean' : '', homepage ? 'homepage' : ''].filter(Boolean).join('+') || 'none';
      await db.insert(classifyProposals).values({
        companyId: c.id, proposedType: out.type, proposedSubType: out.subType,
        confidence: out.confidence, reason: out.reason, signal, status: 'pending',
      }).onConflictDoUpdate({
        target: classifyProposals.companyId,
        set: { proposedType: out.type, proposedSubType: out.subType, confidence: out.confidence,
          reason: out.reason, signal, status: 'pending', createdAt: new Date() },
      });
      proposed++;
    } catch (e) {
      errors++;
      if (errors <= 5) log(`  classify error (${c.domain}): ${(e as Error).message.slice(0, 80)}`);
    }
    if ((idx + 1) % 10 === 0) log(`  classified ${idx + 1}/${targets.length} (${proposed} proposals, ${oceanCalls} Ocean fallbacks)…`);
  }
  void typeLabel;
  return { attempted: targets.length, proposed, errors, oceanCalls };
}
