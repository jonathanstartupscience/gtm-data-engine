/**
 * Experiment stage — assign new contacts to arms (pinned) and push each arm's unsent contacts
 * to its Bison campaign. Re-runnable: only contacts without an assignment get assigned, and only
 * assignments without a pushedAt get pushed, so adding contacts or re-running flows just the new ones.
 */
import { and, eq, isNull, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { experiments, experimentArms, experimentAssignments, bisonCampaigns, bisonSenderAssignments, bisonSequences, workspaces } from '../../db/schema.js';
import { segmentWithIds, pushRowsToBison, buildSuppressionSet, type SegmentRow, type SegmentFilter } from './activate.js';
import { allocate, type ArmWeight } from '../experiments/allocate.js';
import { bisonClientFor } from '../adapters/emailbison.js';
import { unfillableTagsInSteps } from '../email/bisonFormat.js';

export interface ArmView {
  armId: number; campaignId: number; bisonCampaignId: number | null;
  label: string | null; weight: number; assigned: number; pushed: number;
  senderCount: number;            // sender inboxes attached to this arm's campaign
  dailyCapacity: number;          // sum of those inboxes' daily limits
  sharesSenders: boolean;         // ≥1 sender inbox also attached to another arm in this experiment
  unfillableTags: string[];       // merge tags this arm's sequence uses that the push can't fill
}
export interface ExperimentDiagnostics {
  totalDailyCapacity: number;     // distinct sender inboxes across all arms × their daily limit
  sharedSenders: boolean;         // any inbox attached to >1 arm (breaks per-arm isolation)
  missingCompany: number;         // sendable contacts in the segment with no company ({COMPANY} blank)
  alreadyEnrolled: number;        // segment contacts already in another workspace campaign (would be suppressed)
  warnings: string[];             // human-readable program-level warnings
}
export interface ExperimentPreview {
  experimentId: number; name: string; segmentSize: number;
  unassigned: number;                 // contacts in segment with no arm yet
  newByArm: { armId: number; label: string | null; count: number }[]; // how many NEW would flow per arm now
  arms: ArmView[];
  diagnostics: ExperimentDiagnostics;
}

async function loadArms(experimentId: number) {
  return db.select().from(experimentArms).where(eq(experimentArms.experimentId, experimentId));
}

async function filterFor(
  experimentId: number,
): Promise<{ name: string; workspaceId: number | null; filter: SegmentFilter } | null> {
  const [e] = await db.select().from(experiments).where(eq(experiments.id, experimentId));
  if (!e) return null;
  // The segment is bound to the workspace's persona scope; the experiment's own persona (if set)
  // and subType narrow it further. The workspace scope wins as the floor so a workspace can't leak
  // contacts from another persona into its arms. A workspace may scope to a SET of personas via a
  // `personaMatch` LIKE pattern (e.g. 'ESO %') — that pattern, when set, is the floor instead of an
  // exact persona (an exact-match floor of 'eso' against "ESO Leadership"/… would match 0 rows).
  let persona = e.persona ?? undefined;
  let personaMatch: string | undefined;
  if (e.workspaceId) {
    const [w] = await db.select({ persona: workspaces.persona, personaMatch: workspaces.personaMatch })
      .from(workspaces).where(eq(workspaces.id, e.workspaceId));
    if (w?.personaMatch) { personaMatch = w.personaMatch; persona = undefined; }
    else persona = w?.persona ?? persona;
  }
  return {
    name: e.name, workspaceId: e.workspaceId,
    filter: { persona, personaMatch, subType: e.subType ?? undefined },
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

  const campIds = arms.map((a) => a.campaignId);
  const camps = await db.select({ id: bisonCampaigns.id, bisonCampaignId: bisonCampaigns.bisonCampaignId })
    .from(bisonCampaigns).where(inArray(bisonCampaigns.id, campIds));
  const bisonIdByCamp = new Map(camps.map((c) => [c.id, c.bisonCampaignId]));

  // Sender assignments per campaign — for daily-capacity + shared-sender (cross-arm) diagnostics.
  const senderRows = campIds.length
    ? await db.select().from(bisonSenderAssignments).where(inArray(bisonSenderAssignments.campaignId, campIds))
    : [];
  const sendersByCamp = new Map<number, typeof senderRows>();
  for (const s of senderRows) { const l = sendersByCamp.get(s.campaignId) ?? []; l.push(s); sendersByCamp.set(s.campaignId, l); }
  // How many distinct arms each sender inbox is attached to (>1 = shared across arms).
  const armsPerSender = new Map<number, number>();
  for (const a of arms) {
    for (const s of sendersByCamp.get(a.campaignId) ?? []) {
      armsPerSender.set(s.senderEmailId, (armsPerSender.get(s.senderEmailId) ?? 0) + 1);
    }
  }
  // Sequence steps per campaign — to flag merge tags the push can't fill (e.g. {TRIGGER}).
  const stepRows = campIds.length
    ? await db.select({ campaignId: bisonSequences.campaignId, subject: bisonSequences.subject, body: bisonSequences.body })
        .from(bisonSequences).where(inArray(bisonSequences.campaignId, campIds))
    : [];
  const stepsByCamp = new Map<number, { email_subject: string; email_body: string }[]>();
  for (const s of stepRows) {
    const l = stepsByCamp.get(s.campaignId) ?? []; l.push({ email_subject: s.subject ?? '', email_body: s.body ?? '' }); stepsByCamp.set(s.campaignId, l);
  }

  const armViews: ArmView[] = arms.map((a) => {
    const senders = sendersByCamp.get(a.campaignId) ?? [];
    const dailyCapacity = senders.reduce((sum, s) => sum + (s.dailyLimit ?? 0), 0);
    const sharesSenders = senders.some((s) => (armsPerSender.get(s.senderEmailId) ?? 0) > 1);
    return {
      armId: a.id, campaignId: a.campaignId, bisonCampaignId: bisonIdByCamp.get(a.campaignId) ?? null,
      label: a.label, weight: a.weight,
      assigned: assignedByArm.get(a.id) ?? 0, pushed: pushedByArm.get(a.id) ?? 0,
      senderCount: senders.length, dailyCapacity, sharesSenders,
      unfillableTags: unfillableTagsInSteps(stepsByCamp.get(a.campaignId) ?? []),
    };
  });

  // Program-level diagnostics.
  const distinctSenderCap = new Map<number, number>();
  for (const s of senderRows) distinctSenderCap.set(s.senderEmailId, s.dailyLimit ?? 0);
  const totalDailyCapacity = [...distinctSenderCap.values()].reduce((a, b) => a + b, 0);
  const sharedSenders = [...armsPerSender.values()].some((n) => n > 1);
  const missingCompany = seg.filter((r) => !r.companyName).length;

  // Cross-campaign overlap: how many segment contacts are already a lead in another (non-arm)
  // campaign of this workspace and would be suppressed at push time. Reads foreign lead lists.
  const suppress = await buildSuppressionSet(meta.workspaceId, arms.map((a) => a.campaignId), () => {});
  const alreadyEnrolled = suppress.size ? seg.filter((r) => r.email && suppress.has(r.email.toLowerCase())).length : 0;

  const warnings: string[] = [];
  if (sharedSenders) warnings.push('Sender inboxes are shared across arms — the daily quota is pooled and per-arm deliverability/attribution is no longer isolated. Partition senders so each arm has its own.');
  if (missingCompany > 0) warnings.push(`${missingCompany} contact(s) in the segment have no company — {COMPANY} renders blank for them.`);
  if (alreadyEnrolled > 0) warnings.push(`${alreadyEnrolled} contact(s) are already in another campaign in this workspace and will be excluded from the push (no double-emailing).`);
  const allUnfillable = [...new Set(armViews.flatMap((v) => v.unfillableTags))];
  if (allUnfillable.length) warnings.push(`Some arms use merge tags the push can't fill (renders blank): ${allUnfillable.map((t) => `{${t}}`).join(', ')}.`);

  return {
    experimentId, name: meta.name, segmentSize: seg.length, unassigned: unassignedIds.length,
    newByArm: arms.map((a) => ({ armId: a.id, label: a.label, count: newByArmMap.get(a.id) ?? 0 })),
    arms: armViews,
    diagnostics: { totalDailyCapacity, sharedSenders, missingCompany, alreadyEnrolled, warnings },
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
  // Cross-campaign dedup: suppress anyone already in another of the workspace's campaigns, but NOT
  // the experiment's own arm campaigns (those are pinned/idempotent via pushedAt). One set, reused
  // for every arm so we read each foreign campaign's lead list only once.
  const ownCampaignIds = arms.map((a) => a.campaignId);
  const suppress = await buildSuppressionSet(meta.workspaceId, ownCampaignIds, log);
  if (suppress.size) log(`Suppression set: ${suppress.size} email(s) already in other campaigns will be skipped.`);
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
    const r = await pushRowsToBison(bison, camp.bisonCampaignId, rows, (m) => log(`  [${arm.label ?? arm.id}] ${m}`), suppress);
    // Mark pushed (best-effort: those we attempted to create+attach).
    await db.update(experimentAssignments)
      .set({ pushedAt: new Date() })
      .where(and(eq(experimentAssignments.experimentId, experimentId), eq(experimentAssignments.armId, arm.id), isNull(experimentAssignments.pushedAt)));
    perArm.push({ armId: arm.id, label: arm.label, pushed: r.created, failed: r.failed });
    totalPushed += r.created; totalFailed += r.failed;
  }

  return { assignedNew: fresh.length, perArm, totalPushed, totalFailed };
}
