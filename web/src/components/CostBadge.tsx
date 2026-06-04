/**
 * Uniform cost indicator used on every actionable card (hygiene, workflows, enrichment).
 * Free → green "Free" pill. Paid → amber "Cost: $X" pill. Always rendered in the same place
 * (top-right of a card's header) so users never miss whether an action spends money.
 */
export function CostBadge({ costUsd, unit }: { costUsd?: number | null; unit?: string }) {
  const free = !costUsd || costUsd <= 0;
  const style: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap',
    background: free ? 'rgba(101,194,56,0.16)' : 'rgba(212,168,67,0.18)',
    color: free ? 'var(--green-deep)' : '#8b5e00',
    letterSpacing: '0.02em',
  };
  return (
    <span style={style}>
      {free ? 'Free' : `Cost: $${costUsd!.toLocaleString(undefined, { maximumFractionDigits: 4 })}${unit ? ` / ${unit}` : ''}`}
    </span>
  );
}
