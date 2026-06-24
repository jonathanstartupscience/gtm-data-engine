/**
 * Experiment stage — assign new contacts to arms (pinned) and push each arm's unsent contacts
 * to its Bison campaign. Re-runnable: only contacts without an assignment get assigned, and only
 * assignments without a pushedAt get pushed, so adding contacts or re-running flows just the new ones.
 */
import { and, eq, isNull, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { experiments, experimentArms, experimentAssignments, bisonCampaigns, workspaces } from '../../db/schema.js';
import { segmentWithIds, pushRowsToBison, type SegmentRow, type SegmentFilter } from './activate.js';
import { allocate, type ArmWeight } from '../experiments/allocate.js';
import { bisonClientFor } from '../adapters/emailbison.js';

export interface ArmView {
  armId: number; campaignId: number; bisonCampaignId: number | null;
  label: string | null; weight: number; assigned: number; pushed: number;
}
export interface ExperimentPreview {
  experimentId: number; name: string; segmentSize: number;
  unassigned: number;                 // contacts in segment with no arm yet
  newByArm: { armId: number; label: string | null; count: number }[]; // how many NEW would flow per arm now
  arms: ArmView[];
}

async function loadArms(experimentId: number) {
  return db.select().from(experimentArms).where(eq(experimentArms.experimentId, experimentId));
}

async function filterFor(
  experimentId: number,
): Promise<{ name: string; workspaceId: number | null; filter: SegmentFilter } | null> {
  const [e] = await db.select().from(experiments).where(eq(experiments.id, experimentId));
  if (!e) return null;
  // The segment is bound to the workspace's persona; the experiment's own persona (if set) and
  // subType narrow it further. Workspace persona wins as the default so a workspace can't leak
  // contacts from another persona into its arms.
  let persona = e.persona ?? undefined;
  if (e.workspaceId) {
    const [w] = await db.select({ persona: workspaces.persona }).from(workspaces).where(eq(workspaces.id, e.workspaceId));
    persona = w?.persona ?? persona;
  }
  return {
    name: e.name, workspaceId: e.workspaceId,
    filter: { persona, subType: e.subType ?? undefined },
  };
}

/** Compute (without writing) what a push would do right now. */
export async function previewExperiment(experimentId: number): Promise<ExperimentPreview | null> {
  const meta = await filterFor(experimentId);
  if (!meta) return null;
  const arms = await loadArms(experimentId);
  const seg = await segmentWithIds(meta.filter);
  const existing = await db.select({ contactId: experimentAssignments.contactId, armId: experimentAssignments.armId, pushedAt: experimentAssignments.pushedAt })
    .from(experimentAssignments).where(eq(experimentAssignments.experimentId, experimentId));

  const assignedIds = new Set(existing.map((a) => a.contactId));
  const segIds = seg.map((r) => r.contactId);
  const unassignedIds = segIds.filter((id) => !assignedIds.has(id));

  const weights: ArmWeight[] = arms.map((a) => ({ armId: a.id, weight: a.weight }));
  const fresh = allocate(unassignedIds, weights);
  const newByArmMap = new Map<number, number>();
  for (const f of fresh) newByArmMap.set(f.armId, (newByArmMap.get(f.armId) ?? 0) + 1);

  const assignedByArm = new Map<number, number>();
  const pushedByArm = new Map<number, number>();
  for (const a of existing) {
    assignedByArm.set(a.armId, (assignedByArm.get(a.armId) ?? 0) + 1);
    if (a.pushedAt) pushedByArm.set(a.armId, (pushedByArm.get(a.armId) ?? 0) + 1);
  }

  const camps = await db.select({ id: bisonCampaigns.id, bisonCampaignId: bisonCampaigns.bisonCampaignId })
    .from(bisonCampaigns).where(inArray(bisonCampaigns.id, arms.map((a) => a.campaignId)));
  const bisonIdByCamp = new Map(camps.map((c) => [c.id, c.bisonCampaignId]));

  return {
    experimentId, name: meta.name, segmentSize: seg.length, unassigned: unassignedIds.length,
    newByArm: arms.map((a) => ({ armId: a.id, label: a.label, count: newByArmMap.get(a.id) ?? 0 })),
    arms: arms.map((a) => ({
      armId: a.id, campaignId: a.campaignId, bisonCampaignId: bisonIdByCamp.get(a.campaignId) ?? null,
      label: a.label, weight: a.weight,
      assigned: assignedByArm.get(a.id) ?? 0, pushed: pushedByArm.get(a.id) ?? 0,
    })),
  };
}

export interface ExperimentPushResult {
  assignedNew: number;
  perArm: { armId: number; label: string | null; pushed: number; failed: number }[];
  totalPushed: number; totalFailed: number;
}

/** Assign any unassigned segment contacts, then push each arm's unsent contacts to its campaign. */
export async function runExperiment(
  experimentId: number,
  log: (m: string) => void = console.log,
): Promise<ExperimentPushResult> {
  const meta = await filterFor(experimentId);
  if (!meta) throw new Error('experiment not found');
  const arms = await loadArms(experimentId);
  if (!arms.length) throw new Error('experiment has no arms');

  const seg = await segmentWithIds(meta.filter);
  const rowById = new Map<number, SegmentRow>(seg.map((r) => [r.contactId, r]));

  // 1) Assign new contacts (pinned; never reassign existing).
  const existing = await db.select({ contactId: experimentAssignments.contactId })
    .from(experimentAssignments).where(eq(experimentAssignments.experimentId, experimentId));
  const assignedIds = new Set(existing.map((a) => a.contactId));
  const unassignedIds = seg.map((r) => r.contactId).filter((id) => !assignedIds.has(id));
  const weights: ArmWeight[] = arms.map((a) => ({ armId: a.id, weight: a.weight }));
  const fresh = allocate(unassignedIds, weights);
  if (fresh.length) {
    await db.insert(experimentAssignments).values(
      fresh.map((f) => ({ experimentId, contactId: f.contactId, armId: f.armId })),
    ).onConflictDoNothing();
    log(`Assigned ${fresh.length} new contact(s) across ${weights.filter((w) => w.weight > 0).length} live arm(s).`);
  } else {
    log('No new contacts to assign.');
  }

  // 2) Push each arm's not-yet-pushed assigned contacts to its Bison campaign — all through this
  // workspace's Bison client (one account, this workspace's key).
  const bison = await bisonClientFor(meta.workspaceId);
  const perArm: ExperimentPushResult['perArm'] = [];
  let totalPushed = 0, totalFailed = 0;
  for (const arm of arms) {
    const [camp] = await db.select().from(bisonCampaigns).where(eq(bisonCampaigns.id, arm.campaignId));
    const unsent = await db.select({ id: experimentAssignments.id, contactId: experimentAssignments.contactId })
      .from(experimentAssignments)
      .where(and(eq(experimentAssignments.experimentId, experimentId), eq(experimentAssignments.armId, arm.id), isNull(experimentAssignments.pushedAt)));
    if (!unsent.length) { perArm.push({ armId: arm.id, label: arm.label, pushed: 0, failed: 0 }); continue; }
    if (!camp?.bisonCampaignId) {
      log(`  arm "${arm.label ?? arm.id}" skipped — campaign not created in Bison`);
      perArm.push({ armId: arm.id, label: arm.label, pushed: 0, failed: unsent.length });
      totalFailed += unsent.length;
      continue;
    }
    const rows = unsent.map((u) => rowById.get(u.contactId)).filter(Boolean) as SegmentRow[];
    const r = await pushRowsToBison(bison, camp.bisonCampaignId, rows, (m) => log(`  [${arm.label ?? arm.id}] ${m}`));
    // Mark pushed (best-effort: those we attempted to create+attach).
    await db.update(experimentAssignments)
      .set({ pushedAt: new Date() })
      .where(and(eq(experimentAssignments.experimentId, experimentId), eq(experimentAssignments.armId, arm.id), isNull(experimentAssignments.pushedAt)));
    perArm.push({ armId: arm.id, label: arm.label, pushed: r.created, failed: r.failed });
    totalPushed += r.created; totalFailed += r.failed;
  }

  return { assignedNew: fresh.length, perArm, totalPushed, totalFailed };
}
