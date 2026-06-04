import { useState, type KeyboardEvent } from 'react';

/** Comma/Enter-separated multi-value input rendered as removable chips. For job-title /
 *  location lists (matches how Airscale takes include/exclude arrays). */
export function ChipInput({ values, onChange, placeholder }: {
  values: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    onChange([...values, ...parts.filter((p) => !values.includes(p))]);
    setDraft('');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
    else if (e.key === 'Backspace' && !draft && values.length) onChange(values.slice(0, -1));
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', background: '#fff' }}>
      {values.map((v) => (
        <span key={v} className="tag persona" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {v}
          <button onClick={() => onChange(values.filter((x) => x !== v))}
            style={{ border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, lineHeight: 1, color: 'inherit' }}>×</button>
        </span>
      ))}
      <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={onKey} onBlur={() => add(draft)}
        placeholder={values.length ? '' : placeholder}
        style={{ flex: 1, minWidth: 140, border: 'none', outline: 'none', fontSize: 14, padding: '4px 2px', background: 'transparent', fontFamily: 'inherit' }} />
    </div>
  );
}
