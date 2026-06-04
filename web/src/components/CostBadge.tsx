/**
 * Uniform cost indicator used on every actionable card (hygiene, workflows, enrichment).
 * Free → green "Free" pill. Paid → amber "Cost: $X" pill. Always rendered in the same place
 * (top-right of a card's header) so users never miss whether an action spends money.
 */
/**
 * costUsd: number → "Cost: $X" (or "Free" when 0). `unit` appends "/ unit".
 * costUsd: null + paid → "Paid" (cost not yet known, e.g. before scope loads).
 * pending → "Cost: …" placeholder while an estimate loads.
 */
export function CostBadge({ costUsd, unit, paid, pending }: { costUsd?: number | null; unit?: string; paid?: boolean; pending?: boolean }) {
  const free = !pending && !paid && (!costUsd || costUsd <= 0);
  const style: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap',
    background: free ? 'rgba(101,194,56,0.16)' : 'rgba(212,168,67,0.18)',
    color: free ? 'var(--green-deep)' : '#8b5e00',
    letterSpacing: '0.02em',
  };
  let label: string;
  if (pending) label = 'Cost: …';
  else if (free) label = 'Free';
  else if (costUsd == null) label = 'Paid';
  else label = `Cost: ~$${costUsd.toLocaleString(undefined, { maximumFractionDigits: costUsd < 1 ? 4 : 0 })}${unit ? ` / ${unit}` : ''}`;
  return <span style={style}>{label}</span>;
}
