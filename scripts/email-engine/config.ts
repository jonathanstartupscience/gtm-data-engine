/**
 * Experiment build config — the declarative spec for "stand up a workspace's core experiment".
 * One JSON file per workspace lives in scripts/email-engine/configs/<slug>.json and is validated
 * against this shape. The build/push/launch scripts all read it, so a new workspace is: write a
 * config, paste the Bison key, run three commands.
 */
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

export const armSchema = z.object({
  sequenceTemplateId: z.number().int().positive(), // which library sequence this arm runs
  label: z.string().min(1),                         // campaign name suffix, e.g. "Offer · 7-Stream"
  weight: z.number().int().min(0).default(1),       // 0 = paused; equal = even split
  senderEmailIds: z.array(z.number().int().positive()).min(1), // partitioned senders for this arm
});

export const scheduleSchema = z.object({
  monday: z.boolean(), tuesday: z.boolean(), wednesday: z.boolean(), thursday: z.boolean(),
  friday: z.boolean(), saturday: z.boolean(), sunday: z.boolean(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),  // H:i — NOT H:i:s (instance requirement)
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  timezone: z.string(),
});

export const configSchema = z.object({
  workspaceSlug: z.string().min(1),               // resolves workspaceId + Bison key/base
  experimentName: z.string().min(1),
  campaignPrefix: z.string().default(''),         // e.g. "ESO · " — full name = prefix + arm.label
  schedule: scheduleSchema,
  // segment scope. personaFilter:null means "all sendable in the store" (use only when the store's
  // sendable set is entirely this workspace's audience — see HANDOFF #4). Otherwise narrow it.
  // personaLike is a SQL LIKE pattern (e.g. 'ESO %') to scope a workspace to its set of granular
  // persona values — the durable way to express "all sub-personas" (HANDOFF #4 / migration 0012).
  personaFilter: z.string().nullable().default(null),
  personaLike: z.string().nullable().default(null),
  requireCompany: z.boolean().default(true),      // exclude contacts with no company ({COMPANY} blank)
  dedupeAcrossCampaigns: z.boolean().default(true), // exclude anyone already a lead in another campaign
  arms: z.array(armSchema).min(1),
});

export type ExperimentConfig = z.infer<typeof configSchema>;

export function loadConfig(slug: string): ExperimentConfig {
  const path = join(here, 'configs', `${slug}.json`);
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return configSchema.parse(raw);
}
