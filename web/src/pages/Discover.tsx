import { useEffect, useMemo, useState } from 'react';
import { api, postStream, type Company } from '../api.js';
import { useTaxonomy } from '../hooks/useTaxonomy.js';
import { DomainLink } from '../components/Table.js';

type Seed = { domain: string; name: string };

export function Discover() {
  const { types, refresh } = useTaxonomy();
  const [type, setType] = useState('');         // internal value (e.g. CUSTOMER)
  const [subType, setSubType] = useState('');
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [size, setSize] = useState(25);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  // Precise seed picker — search your real companies and check exactly which to use as seeds.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pq, setPq] = useState('');
  const [pickerRows, setPickerRows] = useState<Company[]>([]);
  const [pickerTotal, setPickerTotal] = useState(0);
  const [seedMap, setSeedMap] = useState<Record<string, string>>({}); // domain → name, for chips

  const typeObj = useMemo(() => types.find((t) => t.value === type), [types, type]);
  const subTypes = typeObj?.subTypes ?? [];

  // A sub-type can exist on companies whose Type is null (shown as "(unset)"). In that case we
  // still fetch seeds by sub-type alone — passing the literal "(unset)" would match no rows.
  const typeForQuery = type && type !== '(unset)' ? type : '';
  useEffect(() => {
    if (!subType) { setSeeds([]); setChosen(new Set()); return; }
    api.seeds(typeForQuery, subType).then((d) => { setSeeds(d.seeds); setChosen(new Set(d.seeds.map((s) => s.domain))); });
  }, [typeForQuery, subType]);

  // Load companies for the precise picker (filtered by the same type/sub-type + a search box).
  useEffect(() => {
    if (!pickerOpen) return;
    const t = setTimeout(() => {
      api.companies({ q: pq, type: typeForQuery, subType, country: '', sort: 'name', dir: 'asc', limit: 50, offset: 0 })
        .then((d) => { setPickerRows(d.rows); setPickerTotal(d.total); });
    }, 250);
    return () => clearTimeout(t);
  }, [pickerOpen, pq, typeForQuery, subType]);

  function pickSeed(c: Company) {
    if (!c.domain) return;
    setChosen((s) => { const n = new Set(s); n.has(c.domain!) ? n.delete(c.domain!) : n.add(c.domain!); return n; });
    setSeedMap((m) => ({ ...m, [c.domain!]: c.name ?? c.domain! }));
  }

  function toggle(domain: string) {
    setChosen((c) => { const n = new Set(c); n.has(domain) ? n.delete(domain) : n.add(domain); return n; });
  }

  async function run() {
    setBusy(true); setLog([]); setResult(null);
    await postStream('/api/discover/run',
      { seedDomains: [...chosen], type: type || undefined, subType: subType || undefined, size },
      (ev, data) => {
        if (ev === 'log') setLog((l) => [...l, (data as { message: string }).message]);
        else if (ev === 'done') { setResult((data as { stats: Record<string, unknown> }).stats); refresh(); }
        else if (ev === 'error') setLog((l) => [...l, '✗ ' + (data as { message: string }).message]);
      });
    setBusy(false);
  }

  const planGated = result?.planGated === true;
  const typeLabel = typeObj?.label ?? '';

  return (
    <>
      <h1 className="page-title">Find more <em>companies</em></h1>
      <p className="page-sub">Pick a sub-type, choose example companies, and Ocean finds lookalikes — deduped against what you already have.</p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>1 · Choose a sub-type</h3>
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <select className="select" value={subType}
            onChange={(e) => {
              const v = e.target.value;
              setSubType(v);
              // Selecting a sub-type auto-selects its parent type (only one possible).
              const parent = types.find((t) => t.subTypes.some((s) => s.value === v));
              setType(parent?.value ?? '');
            }}>
            <option value="">Select sub-type…</option>
            {types.map((t) => (
              <optgroup key={t.value} label={t.label}>
                {t.subTypes.map((s) => <option key={t.value + s.value} value={s.value}>{s.value} ({s.count})</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        {subType && (
          <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            {typeLabel && type !== '(unset)' ? (
              <>New companies tagged <span className="tag persona">{typeLabel}</span>{' '}
                <span className="tag persona">{subType}</span> — ready to sync to HubSpot.</>
            ) : (
              <>New companies tagged <span className="tag persona">{subType}</span>. Existing{' '}
                <strong>{subType}</strong> companies have no <em>Type</em> set — run the “Pair Type &amp; Sub-type”
                hygiene task to classify them before syncing.</>
            )}
          </p>
        )}
        <button className="btn" style={{ marginTop: 12 }} onClick={() => setPickerOpen(true)}>
          Pick exact companies from my list →
        </button>
      </div>

      {(seeds.length > 0 || pickerOpen) && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>2 · Choose seed companies to find lookalikes of</h3>
            <button className="btn" onClick={() => setPickerOpen((o) => !o)}>
              {pickerOpen ? 'Use suggested examples' : 'Pick exact companies →'}
            </button>
          </div>

          {!pickerOpen ? (
            <>
              <p className="muted" style={{ marginTop: 8 }}>A spread of your existing {subType} companies. Uncheck any you don’t want, or pick exact ones from your full list.</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {seeds.map((s) => (
                  <label key={s.domain} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
                    border: '1px solid var(--border)', borderRadius: 8,
                    background: chosen.has(s.domain) ? 'var(--accent-light)' : 'transparent', cursor: 'pointer',
                  }}>
                    <input type="checkbox" checked={chosen.has(s.domain)} onChange={() => toggle(s.domain)} />
                    <span>{s.name || s.domain}</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="muted" style={{ marginTop: 8 }}>Search your companies (filtered to the sub-type above) and check the ones to use as seeds.</p>
              <input className="input" style={{ width: '100%', marginBottom: 10 }} placeholder="Search name or domain…"
                value={pq} onChange={(e) => setPq(e.target.value)} />
              <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                <table>
                  <thead><tr><th></th><th>Company</th><th>Domain</th><th>Sub-type</th></tr></thead>
                  <tbody>
                    {pickerRows.map((c) => (
                      <tr key={c.id}>
                        <td><input type="checkbox" disabled={!c.domain} checked={!!c.domain && chosen.has(c.domain)} onChange={() => pickSeed(c)} /></td>
                        <td>{c.name ?? '—'}</td>
                        <td><DomainLink domain={c.domain} /></td>
                        <td>{c.subType && <span className="tag persona">{c.subType}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                Showing {pickerRows.length} of {pickerTotal.toLocaleString()} · <strong>{chosen.size}</strong> selected as seeds
                {chosen.size > 0 && <> — {[...chosen].slice(0, 6).map((d) => seedMap[d] ?? d).join(', ')}{chosen.size > 6 ? '…' : ''}</>}
              </p>
            </>
          )}

          <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
            <label className="muted">How many to find:</label>
            <select className="select" value={size} onChange={(e) => setSize(Number(e.target.value))}>
              {[10, 25, 50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button className="btn btn-primary" disabled={busy || chosen.size === 0} onClick={run}>
              {busy ? 'Searching…' : `Find ${size} similar companies`}
            </button>
          </div>
        </div>
      )}

      {(log.length > 0 || result) && (
        <div className="panel">
          <h3>3 · Results</h3>
          {planGated && (
            <div style={{ padding: 14, borderRadius: 8, background: 'rgba(212,168,67,0.15)', color: '#8b5e00', marginBottom: 12 }}>
              ⚠️ {String(result?.message ?? '')}
            </div>
          )}
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.7, maxHeight: 180, overflow: 'auto' }}>
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
          {result && !planGated && (
            <div className="cards" style={{ marginTop: 16, marginBottom: 0 }}>
              <div className="card"><div className="num">{String(result.newCompanies ?? 0)}</div><div className="label">New companies added</div></div>
              <div className="card"><div className="num">{String(result.alreadyKnown ?? 0)}</div><div className="label">Already in store</div></div>
              <div className="card"><div className="num">{String(result.found ?? 0)}</div><div className="label">Total found</div></div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
