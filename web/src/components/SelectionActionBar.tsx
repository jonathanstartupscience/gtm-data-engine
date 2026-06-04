import { useEffect, useState } from 'react';
import { api, postStream, type SelectionScope } from '../api.js';
import { CostBadge } from './CostBadge.js';

type Kind = 'enrich' | 'verify';

const COPY: Record<Kind, { label: string; runPath: string; scope: (ids: number[]) => Promise<SelectionScope>; noun: string }> = {
  enrich: { label: 'Enrich firmographics', runPath: '/api/actions/enrich-companies/run', scope: (ids) => api.enrichScope(ids), noun: 'companies' },
  verify: { label: 'Verify emails', runPath: '/api/actions/verify-contacts/run', scope: (ids) => api.verifyScope(ids), noun: 'contacts' },
};

/**
 * Floating action bar shown when rows are selected on the Companies/Contacts tabs.
 * Shows a cost preview (billable count + $) BEFORE running, then runs on just the selection —
 * so vendor credits are only ever spent on what the user explicitly picked.
 */
export function SelectionActionBar({ kind, ids, onClear, onDone }: {
  kind: Kind; ids: number[]; onClear: () => void; onDone?: () => void;
}) {
  const c = COPY[kind];
  const [scope, setScope] = useState<SelectionScope | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [done, setDone] = useState<Record<string, unknown> | null>(null);

  useEffect(() => { setScope(null); setDone(null); setConfirming(false); if (ids.length) c.scope(ids).then(setScope).catch(() => setScope(null)); }, [ids, kind]);

  if (!ids.length) return null;

  async function run() {
    setRunning(true); setLog([]); setDone(null);
    await postStream(c.runPath, { confirm: true, ids }, (ev, data) => {
      if (ev === 'log') setLog((l) => [...l, (data as { message: string }).message]);
      else if (ev === 'done') setDone(data as Record<string, unknown>);
      else if (ev === 'error') setLog((l) => [...l, '✗ ' + (data as { message: string }).message]);
    });
    setRunning(false); onDone?.();
  }

  return (
    <div style={{
      position: 'sticky', bottom: 0, marginTop: 16, padding: '14px 18px', borderRadius: 'var(--radius)',
      background: 'var(--dark)', color: 'var(--text-on-dark)', display: 'flex', alignItems: 'center',
      gap: 16, flexWrap: 'wrap', boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
    }}>
      <strong>{ids.length.toLocaleString()} {c.noun} selected</strong>
      {scope && <CostBadge costUsd={scope.estCostUsd} unit={scope.unit} />}
      {scope && <span style={{ fontSize: 13, opacity: 0.85 }}>
        {scope.billable.toLocaleString()} billable via {scope.vendor}{scope.skipped > 0 && ` · ${scope.skipped} skipped (no ${kind === 'enrich' ? 'domain' : 'email'})`}
      </span>}
      <span style={{ flex: 1 }} />
      {done ? (
        <span style={{ color: 'var(--green)' }}>Done ✓</span>
      ) : !confirming ? (
        <>
          <button className="btn" onClick={onClear} style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }}>Clear</button>
          <button className="btn btn-primary" disabled={!scope || scope.billable === 0} onClick={() => setConfirming(true)}>{c.label}</button>
        </>
      ) : (
        <>
          <span style={{ fontSize: 13 }}>Spend {scope ? `$${scope.estCostUsd.toLocaleString(undefined, { maximumFractionDigits: 4 })}` : ''} on {scope?.billable.toLocaleString()} {c.noun}?</span>
          <button className="btn" onClick={() => setConfirming(false)} style={{ background: 'transparent', borderColor: 'rgba(255,255,255,0.25)', color: '#fff' }}>Cancel</button>
          <button className="btn btn-primary" disabled={running} onClick={run}>{running ? 'Running…' : 'Confirm & run'}</button>
        </>
      )}
      {log.length > 0 && !done && (
        <div style={{ flexBasis: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 12, opacity: 0.8, maxHeight: 80, overflow: 'auto' }}>
          {log.slice(-4).map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}
