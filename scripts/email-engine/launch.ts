/**
 * Launch (resume) all campaigns of a workspace's experiment — the final go-live step.
 *   npm run ee:launch -- --workspace eso           # plan only (list what would resume)
 *   npm run ee:launch -- --workspace eso --commit    # resume each campaign in Bison
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { experiments, experimentArms, bisonCampaigns } from '../../src/db/schema.js';
import { loadConfig } from './config.js';
import { ctxFor, client } from './bison.js';

const arg = (f: string) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const COMMIT = process.argv.includes('--commit');

async function main() {
  const slug = arg('--workspace');
  if (!slug) throw new Error('--workspace <slug> required');
  const cfg = loadConfig(slug);
  const [exp] = (await db.select().from(experiments)).filter((e) => e.name === cfg.experimentName);
  if (!exp) throw new Error(`experiment "${cfg.experimentName}" not found`);
  const arms = await db.select().from(experimentArms).where(eq(experimentArms.experimentId, exp.id));
  const camps = await db.select().from(bisonCampaigns).where(inArray(bisonCampaigns.id, arms.map((a) => a.campaignId)));

  const bison = client(await ctxFor(slug));
  for (const c of camps) {
    if (!c.bisonCampaignId) { console.log(`  ${c.name}: no bison id, skip`); continue; }
    if (!COMMIT) { console.log(`  [dry] would resume ${c.name} (bison #${c.bisonCampaignId}, status=${c.status})`); continue; }
    const r = await bison.resumeCampaign(c.bisonCampaignId);
    if (r.ok) { await db.update(bisonCampaigns).set({ status: 'active' }).where(eq(bisonCampaigns.id, c.id)); console.log(`  ✓ launched ${c.name}`); }
    else console.log(`  ✗ ${c.name}: resume ${r.status} ${r.text.slice(0, 120)}`);
  }
  console.log(COMMIT ? '\nLaunched.' : '\n[dry] pass --commit to launch.');
}
main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', (e as Error).message); process.exit(1); });
