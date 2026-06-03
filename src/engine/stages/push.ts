/**
 * Push stage — write the canonical store back to HubSpot (the source of truth).
 * Two phases, by design, so nothing changes without explicit review:
 *   1. preview()  — compute exactly what WOULD change (create vs update + field diffs). No writes.
 *   2. execute()  — perform the writes, only after the user confirms the preview.
 *
 * v1 scope: companies. Pushes type / sub_type / audience_type (the taxonomy we own) +
 * fills blank firmographics. Never blanks a populated HubSpot field.
 */
import { isNotNull, ne, and, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { companies } from '../../db/schema.js';
import { searchCompanyByDomain, patchCompany, createCompany } from '../adapters/hubspot.js';
import { typeLabel } from '../taxonomy.js';

// Store field → HubSpot property, for the fields we sync.
const FIELD_MAP: { store: keyof typeof companies.$inferSelect; hs: string; label: string }[] = [
  { store: 'type', hs: 'type', label: 'Type' },
  { store: 'subType', hs: 'sub_type', label: 'Sub-type' },
  { store: 'audienceType', hs: 'audience_type', label: 'Audience' },
  { store: 'foundedYear', hs: 'founded_year', label: 'Founded' },
  { store: 'sizeEmployees', hs: 'numberofemployees', label: 'Employees' },
];

export interface FieldChange { field: string; from: string; to: string }
export interface CompanyChange {
  storeId: number; name: string; domain: string; action: 'create' | 'update';
  hubspotId?: string; changes: FieldChange[];
}
export interface PushPreview {
  total: number; toCreate: number; toUpdate: number; unchanged: number;
  changes: CompanyChange[]; // capped sample for display
  truncated: boolean;
}

/** Companies in the store worth considering for push (have a domain + a type/sub_type). */
async function candidates(limit: number) {
  return db.select().from(companies)
    .where(and(isNotNull(companies.domain), ne(companies.domain, '')))
    .limit(limit);
}

/**
 * Compute what pushing would change. Reads HubSpot per company (so it's accurate), but
 * writes NOTHING. `sampleCap` bounds how many detailed diffs we return for display.
 */
export async function previewPush(
  opts: { limit?: number; sampleCap?: number } = {},
  log: (m: string) => void = console.log,
): Promise<PushPreview> {
  const rows = await candidates(opts.limit ?? 2000);
  const sampleCap = opts.sampleCap ?? 100;
  let toCreate = 0, toUpdate = 0, unchanged = 0;
  const changes: CompanyChange[] = [];

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    const domain = c.domain!;
    const hs = await searchCompanyByDomain(domain, ['domain', 'name', 'type', 'sub_type', 'audience_type', 'founded_year', 'numberofemployees']);
    if (!hs) {
      toCreate++;
      if (changes.length < sampleCap) {
        changes.push({ storeId: c.id, name: c.name ?? domain, domain, action: 'create',
          changes: [{ field: 'New record', from: '—', to: `${typeLabel(c.type)} / ${c.subType ?? ''}` }] });
      }
    } else {
      const p = hs.properties ?? {};
      const diffs: FieldChange[] = [];
      for (const f of FIELD_MAP) {
        const want = (c[f.store] as string | null) ?? '';
        const have = (p[f.hs] as string | undefined) ?? '';
        // Only propose a change if we have a value AND it differs AND (HS is blank OR it's a taxonomy field we own).
        const owns = f.hs === 'type' || f.hs === 'sub_type' || f.hs === 'audience_type';
        if (want && want !== have && (!have || owns)) {
          diffs.push({ field: f.label, from: have || '(blank)', to: f.hs === 'type' ? typeLabel(want) : want });
        }
      }
      if (diffs.length) {
        toUpdate++;
        if (changes.length < sampleCap) {
          changes.push({ storeId: c.id, name: c.name ?? domain, domain, action: 'update', hubspotId: hs.id, changes: diffs });
        }
      } else unchanged++;
    }
    if ((i + 1) % 100 === 0) log(`  previewed ${i + 1}/${rows.length}…`);
  }

  return {
    total: rows.length, toCreate, toUpdate, unchanged,
    changes, truncated: toCreate + toUpdate > changes.length,
  };
}

/** Execute the push — apply the same logic as preview, but WRITE. Only call after confirm. */
export async function executePush(
  opts: { limit?: number } = {},
  log: (m: string) => void = console.log,
): Promise<{ created: number; updated: number; unchanged: number; errors: number }> {
  const rows = await candidates(opts.limit ?? 2000);
  let created = 0, updated = 0, unchanged = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const c = rows[i];
    const domain = c.domain!;
    try {
      const hs = await searchCompanyByDomain(domain, ['domain', 'type', 'sub_type', 'audience_type', 'founded_year', 'numberofemployees']);
      if (!hs) {
        const props: Record<string, string> = { domain };
        if (c.name) props.name = c.name;
        for (const f of FIELD_MAP) { const v = c[f.store] as string | null; if (v) props[f.hs] = v; }
        await createCompany(props);
        created++;
      } else {
        const p = hs.properties ?? {};
        const patch: Record<string, string> = {};
        for (const f of FIELD_MAP) {
          const want = (c[f.store] as string | null) ?? '';
          const have = (p[f.hs] as string | undefined) ?? '';
          const owns = f.hs === 'type' || f.hs === 'sub_type' || f.hs === 'audience_type';
          if (want && want !== have && (!have || owns)) patch[f.hs] = want;
        }
        if (Object.keys(patch).length) { await patchCompany(hs.id, patch); updated++; }
        else unchanged++;
      }
    } catch (e) {
      errors++;
      if (errors <= 5) log(`  push error (${domain}): ${(e as Error).message.slice(0, 80)}`);
    }
    if ((i + 1) % 50 === 0) log(`  pushed ${i + 1}/${rows.length}…`);
  }
  void sql;
  return { created, updated, unchanged, errors };
}
