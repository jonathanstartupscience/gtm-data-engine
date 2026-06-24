import { db } from './src/db/index.ts';
import { sequenceTemplates } from './src/db/schema.ts';
import { inArray } from 'drizzle-orm';
const esoIds = [11,12,23,24,25,26,27,28,29,30,31,32];
const rows = await db.select().from(sequenceTemplates).where(inArray(sequenceTemplates.id, esoIds));
for (const r of rows.sort((a,b)=>a.id-b.id)) {
  const steps = r.stepsJson || [];
  console.log(`#${r.id} [${r.styleKey||'?'}] ${r.name} — ${steps.length} steps, painKey=${r.painKey||'-'}, leadMagnet=${r.leadMagnetId||'-'}, abVariant=${r.abVariant}`);
}
process.exit(0);
