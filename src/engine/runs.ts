/** Run tracking — every recipe execution gets a row in `runs` with live stats + a
 *  human-readable step waterfall (which provider, what action, how it went). */
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { runs } from '../db/schema.js';

export interface RunStep {
  label: string;            // human-readable: "Searched Ocean for lookalikes"
  provider?: string;        // 'Ocean.io' | 'Bouncer' | 'Airscale' | 'HubSpot' | 'Engine'
  status: 'ok' | 'warn' | 'error' | 'info';
  detail?: string;          // "25 candidates returned, 18 new"
  count?: number;           // optional headline number
}

/** A recorder threaded through a recipe to capture the waterfall as it runs. */
export class StepRecorder {
  steps: RunStep[] = [];
  constructor(private onLog?: (m: string) => void) {}
  step(s: RunStep): void {
    this.steps.push(s);
    const icon = s.status === 'error' ? '✗' : s.status === 'warn' ? '⚠' : s.status === 'info' ? '·' : '✓';
    const prov = s.provider ? `[${s.provider}] ` : '';
    this.onLog?.(`${icon} ${prov}${s.label}${s.detail ? ' — ' + s.detail : ''}`);
  }
}

export async function startRun(kind: string): Promise<number> {
  const [r] = await db.insert(runs).values({ kind, status: 'running', stats: {} }).returning({ id: runs.id });
  return r.id;
}

/** Finish a run; `stats` is the summary, `steps` the waterfall. Both stored in stats jsonb. */
export async function finishRun(
  id: number, status: 'done' | 'error', stats: unknown, steps?: RunStep[],
): Promise<void> {
  const payload = steps ? { ...(stats as object), _steps: steps } : (stats as object);
  await db.update(runs).set({ status, stats: payload, finishedAt: new Date() }).where(eq(runs.id, id));
}
