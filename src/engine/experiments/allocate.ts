/**
 * Deterministic weighted allocation for variation testing.
 *
 * Each new contact is assigned to exactly one live arm (weight > 0). Assignment is a pure
 * function of (contactId, armId, weight) — NO randomness — so the split is stable and
 * reproducible: re-running never moves anyone, and changing weights only changes where NEW
 * contacts go. Uses the A-Res weighted-reservoir trick: score = hash01 ** (1 / weight); pick
 * the max. With equal weights this reduces to an even split; higher weight => proportionally
 * more new contacts.
 */

/** FNV-1a 32-bit hash of a string -> uint32. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Stable, well-distributed hash of (contactId, armId) mapped to (0,1). We run the FNV output
 * through an integer finalizer (MurmurHash3 fmix32) so neighboring arm ids don't bias the
 * magnitude — the raw FNV value alone is not uniform enough for the weighted key below.
 */
function hash01(contactId: number, armId: number): number {
  let h = fnv1a(`${contactId}:${armId}`);
  // fmix32 avalanche — scrambles the bits so the result is ~uniform in [0,1).
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  // +1 keeps it strictly within (0,1] so -ln(u) is finite and positive.
  return ((h >>> 0) + 1) / 4294967297;
}

export interface ArmWeight { armId: number; weight: number }

/**
 * Pick the arm for a contact among LIVE arms (weight > 0), deterministically and weighted.
 * Uses the canonical weighted-reservoir key: key = -ln(u) / weight, pick the MINIMUM. With a
 * uniform u this yields exact weight-proportional selection (heavier weight => smaller expected
 * key => more likely chosen) and reduces to an even split at equal weights. Numerically stable.
 * Returns null if no arm has positive weight.
 */
export function pickArm(contactId: number, arms: ArmWeight[]): number | null {
  let bestArm: number | null = null;
  let bestKey = Infinity;
  for (const a of arms) {
    if (a.weight <= 0) continue;
    const key = -Math.log(hash01(contactId, a.armId)) / a.weight;
    if (key < bestKey) { bestKey = key; bestArm = a.armId; }
  }
  return bestArm;
}

/**
 * Allocate a list of UNASSIGNED contact ids across arms. Pure: given the same inputs it always
 * returns the same mapping. Contacts that can't be placed (no live arm) are omitted.
 */
export function allocate(contactIds: number[], arms: ArmWeight[]): { contactId: number; armId: number }[] {
  const live = arms.filter((a) => a.weight > 0);
  if (!live.length) return [];
  const out: { contactId: number; armId: number }[] = [];
  for (const contactId of contactIds) {
    const armId = pickArm(contactId, live);
    if (armId !== null) out.push({ contactId, armId });
  }
  return out;
}
