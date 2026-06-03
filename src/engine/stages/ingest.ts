/**
 * Ingest stage — take parsed rows (from a CSV upload), land them in raw_records,
 * then resolve each into the canonical store (dedupe + golden records).
 * Works for company rows or contact rows. Reuses the M2 resolution service.
 */
import { db } from '../../db/index.js';
import { sources, rawRecords } from '../../db/schema.js';
import { resolveCompany, resolveContact, type CompanyInput, type ContactInput } from '../resolve.js';
import { classifyPersona } from '../persona.js';
import { rowHash } from '../normalize.js';

export type EntityType = 'company' | 'contact';

/** A column mapping: store-field -> source CSV column name. */
export type Mapping = Record<string, string>;

const pick = (row: Record<string, string>, col?: string) =>
  col && row[col] != null ? String(row[col]).trim() : '';

/** Create a source row for provenance; returns its id. */
export async function createSource(name: string, meta: unknown): Promise<number> {
  const [s] = await db.insert(sources).values({ name, type: 'csv', meta: meta as object })
    .returning({ id: sources.id });
  return s.id;
}

export interface IngestResult {
  sourceId: number;
  total: number;
  resolved: number;
  companies: number;
  contacts: number;
  errors: number;
}

/**
 * Ingest rows of a given entity type using a column mapping.
 * mapping maps canonical fields → source columns, e.g.
 *   company: { name:'Company', domain:'Website', subType:'Type', ... }
 *   contact: { firstName:'First', lastName:'Last', email:'Email', jobTitle:'Title',
 *              companyDomain:'Company Domain', linkedinUrl:'LinkedIn' }
 */
export async function ingestRows(
  rows: Record<string, string>[],
  entityType: EntityType,
  mapping: Mapping,
  sourceName: string,
  log: (m: string) => void = console.log,
): Promise<IngestResult> {
  const sourceId = await createSource(sourceName, { entityType, mapping, rows: rows.length });
  let resolved = 0, companies = 0, contacts = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      // land raw
      const hash = await rowHash(Object.values(row));
      await db.insert(rawRecords).values({
        sourceId, entityType, payload: row as object, rowHash: hash,
      });

      if (entityType === 'company') {
        const input: CompanyInput = {
          name: pick(row, mapping.name), domain: pick(row, mapping.domain),
          website: pick(row, mapping.website), type: pick(row, mapping.type),
          subType: pick(row, mapping.subType), audienceType: pick(row, mapping.audienceType),
          country: pick(row, mapping.country), state: pick(row, mapping.state),
          city: pick(row, mapping.city), linkedinUrl: pick(row, mapping.linkedinUrl),
          foundedYear: pick(row, mapping.foundedYear), sizeEmployees: pick(row, mapping.sizeEmployees),
          sector: pick(row, mapping.sector), hubspotId: pick(row, mapping.hubspotId),
        };
        if (!input.name && !input.domain) { errors++; continue; }
        await resolveCompany(input, sourceName);
        companies++; resolved++;
      } else {
        const title = pick(row, mapping.jobTitle);
        const input: ContactInput = {
          firstName: pick(row, mapping.firstName), lastName: pick(row, mapping.lastName),
          email: pick(row, mapping.email), jobTitle: title,
          persona: pick(row, mapping.persona) || classifyPersona(title) || '',
          linkedinUrl: pick(row, mapping.linkedinUrl),
          companyDomain: pick(row, mapping.companyDomain),
          hubspotId: pick(row, mapping.hubspotId),
        };
        if (!input.email && !input.firstName && !input.lastName) { errors++; continue; }
        await resolveContact(input, sourceName);
        contacts++; resolved++;
      }
    } catch (e) {
      errors++;
      if (errors <= 5) log(`  row ${i + 1} error: ${(e as Error).message.slice(0, 100)}`);
    }
    if ((i + 1) % 50 === 0) log(`  ingested ${i + 1}/${rows.length}`);
  }

  return { sourceId, total: rows.length, resolved, companies, contacts, errors };
}
