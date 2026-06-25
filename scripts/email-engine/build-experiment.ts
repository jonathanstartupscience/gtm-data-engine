/**
 * Build (or rebuild) a workspace's core experiment in Bison from its config.
 *   npm run ee:build -- --workspace eso           # plan only
 *   npm run ee:build -- --workspace eso --commit    # delete+recreate campaigns, wire arms
 *
 * For each arm: create a Bison campaign → set schedule → set sequence steps (transformed from the
 * library template) → attach that arm's senders. Then create/reuse the experiment + arms locally.
 *
 * Because this instance's sequence-steps endpoint APPENDS (no replace, no per-step delete), a
 * rebuild DELETES the existing campaign and recreates it clean. Safe ONLY before leads are pushed.
 */
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { workspaces, sequenceTemplates, experiments, experimentArms,
         bisonCampaigns, bisonSequences, bisonSenderAssignments } from '../../src/db/schema.js';
import { loadConfig } from './config.js';
import { ctxFor, client } from './bison.js';
import { toBisonStep, unsupportedTags, type StoredStep } from './transform.js';

const arg = (f: string) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };
const COMMIT = process.argv.includes('--commit');

async function main() {
  const slug = arg('--workspace');
  if (!slug) throw new Error('--workspace <slug> required');
  const cfg = loadConfig(slug);
  // Select only needed cols (avoid emitting a not-yet-migrated persona_match column).
  const [ws] = await db.select({ id: workspaces.id, persona: workspaces.persona }).from(workspaces).where(eq(workspaces.slug, slug));
  if (!ws) throw new Error(`workspace "${slug}" not found`);

  const tplIds = cfg.arms.map((a) => a.sequenceTemplateId);
  const tpls = await db.select().from(sequenceTemplates).where(inArray(sequenceTemplates.id, tplIds));
  const tplById = new Map(tpls.map((t) => [t.id, t]));
  for (const a of cfg.arms) if (!tplById.has(a.sequenceTemplateId)) throw new Error(`template ${a.sequenceTemplateId} not found`);

  // Pre-flight: warn on any sequence with merge tags the push can't fill (e.g. {{trigger}}).
  for (const a of cfg.arms) {
    const t = tplById.get(a.sequenceTemplateId)!;
    const bad = (t.stepsJson as StoredStep[]).flatMap(unsupportedTags);
    if (bad.length) console.log(`  ⚠ "${a.label}" uses unfillable tags ${[...new Set(bad)].join(', ')} — they will render blank.`);
  }

  console.log(`\nBuild "${cfg.experimentName}" (workspace ${slug}, ${cfg.arms.length} arms)`);
  for (const a of cfg.arms) {
    const t = tplById.get(a.sequenceTemplateId)!;
    console.log(`  ${cfg.campaignPrefix}${a.label}  ← seq #${a.sequenceTemplateId} (${(t.stepsJson as StoredStep[]).length} steps, w=${a.weight}, senders ${a.senderEmailIds.length})`);
  }
  if (!COMMIT) { console.log('\n[plan only] pass --commit to build.'); return; }

  const bison = client(await ctxFor(slug));
  const SCHEDULE = { ...cfg.schedule, save_as_template: false };

  // experiment (reuse by name)
  let [exp] = (await db.select().from(experiments).where(eq(experiments.workspaceId, ws.id))).filter((e) => e.name === cfg.experimentName);
  if (!exp) { [exp] = await db.insert(experiments).values({ workspaceId: ws.id, name: cfg.experimentName, persona: cfg.personaFilter, subType: null, status: 'active' }).returning(); }
  const existingArms = await db.select().from(experimentArms).where(eq(experimentArms.experimentId, exp.id));
  const armByLabel = new Map(existingArms.map((x) => [x.label, x]));

  for (const a of cfg.arms) {
    const name = `${cfg.campaignPrefix}${a.label}`;
    const t = tplById.get(a.sequenceTemplateId)!;
    const steps = (t.stepsJson as StoredStep[]).map(toBisonStep);

    // If an arm+campaign already exists, delete the old Bison campaign first (rebuild clean).
    const priorArm = armByLabel.get(name);
    let localCampId: number | undefined;
    if (priorArm) {
      const [priorCamp] = await db.select().from(bisonCampaigns).where(eq(bisonCampaigns.id, priorArm.campaignId));
      if (priorCamp?.bisonCampaignId) await bison.req('DELETE', `/campaigns/${priorCamp.bisonCampaignId}`);
      localCampId = priorCamp?.id;
    }

    const created = JSON.parse((await bison.req('POST', '/campaigns', { name })).text);
    const bid = created.id ?? created.data?.id;
    await bison.req('POST', `/campaigns/${bid}/schedule`, SCHEDULE);
    const st = await bison.req('POST', `/campaigns/${bid}/sequence-steps`, { title: name, sequence_steps: steps });
    const at = await bison.req('POST', `/campaigns/${bid}/attach-sender-emails`, { sender_email_ids: a.senderEmailIds });

    // persist local campaign (reuse row if rebuilding)
    let campId = localCampId;
    if (campId) {
      await db.update(bisonCampaigns).set({ bisonCampaignId: bid, status: 'created', syncedAt: new Date() }).where(eq(bisonCampaigns.id, campId));
      await db.delete(bisonSequences).where(eq(bisonSequences.campaignId, campId));
      await db.delete(bisonSenderAssignments).where(eq(bisonSenderAssignments.campaignId, campId));
    } else {
      const [row] = await db.insert(bisonCampaigns).values({ workspaceId: ws.id, bisonCampaignId: bid, name, status: 'created', persona: cfg.personaFilter, subType: null, scheduleJson: SCHEDULE, syncedAt: new Date() }).returning();
      campId = row.id;
    }
    await db.insert(bisonSequences).values(steps.map((s) => ({ campaignId: campId!, stepOrder: s.order, waitInDays: s.wait_in_days, subject: s.email_subject, body: s.email_body, variant: null, threadReply: false })));
    if (a.senderEmailIds.length) await db.insert(bisonSenderAssignments).values(a.senderEmailIds.map((sid) => ({ campaignId: campId!, senderEmailId: sid })));

    if (priorArm) await db.update(experimentArms).set({ weight: a.weight }).where(eq(experimentArms.id, priorArm.id));
    else await db.insert(experimentArms).values({ experimentId: exp.id, campaignId: campId!, label: name, weight: a.weight, sequenceTemplateId: a.sequenceTemplateId });

    console.log(`  ✓ ${name}  bison #${bid}  schedule+steps(${st.status})+senders(${at.status})`);
  }
  console.log('\nBuilt. Verify in Bison, then: npm run ee:push -- --workspace ' + slug);
}
main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', (e as Error).message); process.exit(1); });
