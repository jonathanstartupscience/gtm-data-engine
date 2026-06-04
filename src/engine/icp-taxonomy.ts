/**
 * Canonical ICP taxonomy — the company Type → Sub-type framework, from the team's source-of-truth
 * sheet (ICP = Type, Sub-ICP = Sub-type). Drives: the Type↔Sub-type pairing hygiene task, the
 * classifier's allowed labels, pickers, and tooltips.
 *
 * Types here use HUMAN labels (ESO, Investor, …). The store persists HubSpot's INTERNAL type value
 * for some (CUSTOMER=ESO, etc.) — use taxonomy.ts `typeValue()`/`typeLabel()` to translate at the
 * store boundary. Sub-types are stored as their human label.
 */

export interface SubType { name: string; definition: string; aliases?: string[] }
export interface IcpType { type: string; subTypes: SubType[] }

export const ICP_TAXONOMY: IcpType[] = [
  {
    type: 'ESO',
    subTypes: [
      { name: 'Corporate Accelerator/Incubator', definition: 'A program or subsidiary of a large company that accelerates or incubates startups.', aliases: ['corporate accelerator', 'corporate incubator'] },
      { name: 'Private Accelerator/Incubator', definition: 'A non-corporate entity offering programs, resources, and often seed funding to startups.', aliases: ['private accelerator', 'accelerator', 'incubator', 'venture studio', 'studio'] },
      { name: 'University', definition: 'An academic institution fostering innovation, research, and providing talent and resources to startups.', aliases: ['university', 'college', 'academic'] },
      { name: 'Business Association/Nonprofit', definition: 'Supports businesses, often through networking, advocacy, and resources in the startup ecosystem.', aliases: ['association', 'nonprofit', 'non-profit', 'business association', 'economic development org', 'economic development', 'sbdc', 'founder community'] },
      { name: 'Government', definition: 'Public sector entities providing regulatory oversight, funding, and support to the startup ecosystem.', aliases: ['government', 'government innovation agency', 'public sector', 'visa program'] },
      { name: 'Chamber of Commerce', definition: 'Local business advocacy group supporting community commerce and networking opportunities.', aliases: ['chamber of commerce', 'chamber'] },
      { name: 'Hackathon/Pitch Competition', definition: 'Events where participants quickly develop ideas or present ventures for judging and funding.', aliases: ['hackathon', 'pitch competition'] },
      { name: 'Coworking Spaces', definition: 'Shared office environments providing flexible workspace and networking opportunities for startups and professionals.', aliases: ['coworking', 'coworking spaces', 'co-working'] },
    ],
  },
  {
    type: 'Investor',
    subTypes: [
      { name: 'Syndicate/Angel Group', definition: 'A collective of angel investors pooling capital to invest in startups.', aliases: ['syndicate', 'angel group', 'angel goup'] },
      { name: 'Angel/LP', definition: 'An individual investor or an entity that commits capital to venture funds or startups.', aliases: ['angel', 'angel/lp', 'lp', 'limited partner'] },
      { name: 'Venture Capital (VC)', definition: 'Firms that invest in high-growth potential startups in exchange for equity.', aliases: ['vc', 'venture capital', 'venture'] },
      { name: 'Corporate Venture Capital', definition: 'The investment arm of an existing large corporation that invests in external startups.', aliases: ['cvc', 'corporate venture capital', 'corporate vc'] },
      { name: 'Private Equity (PE)', definition: 'Firm that invests large capital in mature companies to scale operations and achieve exit.', aliases: ['pe', 'private equity'] },
      { name: 'Family Office', definition: 'Private wealth management entity for ultra-high-net-worth families, often investing in startups.', aliases: ['family office'] },
    ],
  },
  {
    type: 'Mentor',
    subTypes: [
      { name: 'Mentor/Advisor', definition: 'Provides guidance, expertise, and support to startups and founders.', aliases: ['mentor', 'advisor', 'mentor/advisor', 'advisor agency'] },
    ],
  },
  {
    type: 'Competitor',
    subTypes: [
      { name: 'Competitor', definition: 'An organization operating in the same market or offering similar products/services as your startup.', aliases: ['competitor'] },
    ],
  },
  {
    type: 'Partner',
    subTypes: [
      { name: 'Corporate Sponsor Partner', definition: 'Corporations funding placements, visibility, or programs across Startup Science platforms and communications.', aliases: ['corporate sponsor partner', 'corporate sponsor'] },
      { name: 'Strategic Partner', definition: 'Large organizations deploying Startup Science at scale to grow and align entire ecosystems.', aliases: ['strategic partner'] },
      { name: 'Geographic Partner', definition: 'Region-based operators delivering programs independently while sharing revenue from their defined territories.', aliases: ['geographic partner', 'geo partner'] },
      { name: 'Industry Partner', definition: 'Sector-focused organizations deploying Startup Science across an entire industry rather than a location.', aliases: ['industry partner'] },
      { name: 'Specialty School Partner', definition: 'Education programs delivering Startup Science curricula as part of graduate, preparatory, or academic offerings.', aliases: ['specialty school partner', 'school partner'] },
      { name: 'Technology Partner (Tools)', definition: "Companies integrating tools or APIs to enhance Startup Science's platform functionality and interoperability.", aliases: ['technology partner', 'tech partner', 'technology partner (tools)'] },
    ],
  },
  {
    type: 'Provider',
    subTypes: [
      { name: 'Software Provider', definition: 'A company that develops and sells software products or services to startups.', aliases: ['software', 'software provider', 'saas'] },
      { name: 'Service Provider', definition: 'Organizations offering specialized services like legal, accounting, or marketing to support startups.', aliases: ['service provider', 'services', 'agency'] },
    ],
  },
  {
    type: 'Startup',
    subTypes: [
      { name: 'Startup', definition: 'A newly established company designed to develop a unique product or service.', aliases: ['startup'] },
    ],
  },
  {
    type: 'Vendor',
    subTypes: [
      { name: 'Vendor', definition: 'Provides goods or services to the startup, often on a contractual basis.', aliases: ['vendor'] },
      { name: 'Event', definition: 'A gathering designed to connect, educate, and promote startups, investors, and partners.', aliases: ['event', 'events'] },
    ],
  },
  {
    type: 'Sponsor',
    subTypes: [
      { name: 'Sponsor', definition: 'An entity providing funding, resources, or services in exchange for visibility or partnership.', aliases: ['sponsor'] },
    ],
  },
];

/** Catch-all the sheet defines for anything outside the ICP. */
export const NOT_IN_ICP = { type: 'Not in ICP', subType: 'Not in ICP', definition: "Any company in our CRM that doesn't fit any of our Sub ICP definitions." };

// ----- derived lookups -----
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** canonical sub-type (normalized) → its Type label. */
const SUBTYPE_TO_TYPE = new Map<string, string>();
/** any alias/canonical (normalized) → canonical sub-type name. */
const ALIAS_TO_CANON = new Map<string, string>();
for (const t of ICP_TAXONOMY) {
  for (const s of t.subTypes) {
    SUBTYPE_TO_TYPE.set(norm(s.name), t.type);
    ALIAS_TO_CANON.set(norm(s.name), s.name);
    for (const a of s.aliases ?? []) { ALIAS_TO_CANON.set(norm(a), s.name); SUBTYPE_TO_TYPE.set(norm(a), t.type); }
  }
}

/** All Type labels in priority order (for pickers). */
export const ICP_TYPES = ICP_TAXONOMY.map((t) => t.type);

/** Resolve a (possibly messy/multi-valued) stored sub-type to {type, subType} per the taxonomy.
 *  Handles "Private Accelerator;Association" by taking the first recognized token. Null if unknown. */
export function inferTypeFromSubType(rawSubType: string | null | undefined): { type: string; subType: string } | null {
  if (!rawSubType) return null;
  // Split common multi-value separators and try each token.
  const tokens = rawSubType.split(/[;,/|]/).map((x) => x.trim()).filter(Boolean);
  for (const tok of [rawSubType, ...tokens]) {
    const key = norm(tok);
    if (SUBTYPE_TO_TYPE.has(key)) return { type: SUBTYPE_TO_TYPE.get(key)!, subType: ALIAS_TO_CANON.get(key) ?? tok };
    // loose contains-match for things like "Accelerator - Mentor"
    for (const [alias, canon] of ALIAS_TO_CANON) {
      if (key.includes(alias) && alias.length >= 4) return { type: SUBTYPE_TO_TYPE.get(alias)!, subType: canon };
    }
  }
  return null;
}

/** Flat list of {type, subType, definition} for the classifier prompt + UI reference. */
export function taxonomyFlat(): { type: string; subType: string; definition: string }[] {
  return ICP_TAXONOMY.flatMap((t) => t.subTypes.map((s) => ({ type: t.type, subType: s.name, definition: s.definition })));
}
