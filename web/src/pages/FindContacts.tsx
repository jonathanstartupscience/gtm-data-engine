import { useEffect, useState, useMemo } from 'react';
import { api, postStream, type TaxonomyType } from '../api.js';
import { CostBadge } from '../components/CostBadge.js';

const PERSONAS = ['ESO Leadership', 'ESO Program', 'ESO Partnerships', 'ESO Founder/GP'];

/**
 * Find Contacts — COMPANY-FIRST. You choose which companies (by Type / Sub-type / country and
 * optionally only those missing the persona), then which role to source. Mirrors how outbound
 * actually works: find people *at the accounts we care about*.
 */
export function FindContacts() {
  // Step 1 — which companies
  const [type, setType] = useState('');
  const [subType, setSubType] = useState('');
  const [country, setCountry] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [types, setTypes] = useState<TaxonomyType[]>([]);
  const [countries, setCountries] = useState<{ v: string; n: number }[]>([]);
  // Step 2 — who
  const [persona, setPersona] = useState('');

  const [scope, setScope] = useState<{ candidates: number; unit: string; estPeople: number; estCostUsd: number; vendor: string; what: string } | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    api.taxonomy().then((d) => setTypes(d.types));
    api.companyFacets().then((d) => setCountries(d.countries));
  }, []);
  const subTypes = useMemo(() => types.find((t) => t.value === type)?.subTypes ?? [], [types, type]);

  useEffect(() => {
    setScope(null);
    if (!persona) return;
    setScopeLoading(true);
    const t = setTimeout(() => {
      api.findContactsScope({ persona, type: type || undefined, subType: subType || undefined, country: country || undefined, onlyMissing })
        .then(setScope).finally(() => setScopeLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [persona, type, subType, country, onlyMissing]);

  async function run() {
    setRunning(true); setLog([]); setResult(null);
    await postStream('/api/discover/find-contacts',
      { confirm: true, persona, type: type || undefined, subType: subType || undefined, country: country || undefined, onlyMissingPersona: onlyMissing },
      (ev, data) => {
        if (ev === 'log') setLog((l) => [...l, (data as { message: string }).message]);
        else if (ev === 'done') setResult((data as { stats: Record<string, unknown> }).stats);
        else if (ev === 'error') setLog((l) => [...l, '✗ ' + (data as { message: string }).message]);
      });
    setRunning(false);
  }

  const cost = scope?.estCostUsd ?? 0;

  return (
    <>
      <h1 className="page-title">Find more <em>contacts</em></h1>
      <p className="page-sub">Start with the companies you want people at, then pick the role. Airscale sources the contacts and we verify their emails — the people-side counterpart to Find Companies.</p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>1 · Which companies?</h3>
        <div className="toolbar" style={{ marginBottom: 10 }}>
          <select className="select" value={type} onChange={(e) => { setType(e.target.value); setSubType(''); }}>
            <option value="">All types</option>
            {types.map((t) => <option key={t.value} value={t.value}>{t.label} ({t.count})</option>)}
          </select>
          <select className="select" value={subType} onChange={(e) => setSubType(e.target.value)} disabled={!type}>
            <option value="">{type ? 'All sub-types' : 'Pick a type first'}</option>
            {subTypes.map((s) => <option key={s.value} value={s.value}>{s.value} ({s.count})</option>)}
          </select>
          <select className="select" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {countries.map((c) => <option key={c.v} value={c.v}>{c.v} ({c.n})</option>)}
          </select>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
          <span>Only companies that don’t already have this persona <span className="muted">(skips accounts you’ve already covered)</span></span>
        </label>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>2 · Who are you looking for?</h3>
        <select className="select" value={persona} onChange={(e) => setPersona(e.target.value)}>
          <option value="">Select a persona / role…</option>
          {PERSONAS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {persona && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>3 · Scope &amp; cost</h3>
            <CostBadge costUsd={cost} unit="run" />
          </div>
          {scopeLoading || !scope ? <p className="muted" style={{ marginTop: 12 }}>Checking…</p> : (
            <>
              <p className="muted" style={{ marginTop: 12 }}>{scope.what}</p>
              <div className="cards" style={{ marginBottom: 0 }}>
                <div className="card"><div className="num">{scope.candidates.toLocaleString()}</div><div className="label">{scope.unit}</div></div>
                <div className="card"><div className="num">~{scope.estPeople.toLocaleString()}</div><div className="label">People to source</div></div>
                <div className="card"><div className="num" style={{ color: cost >= 25 ? 'var(--coral)' : undefined }}>${cost < 1 ? cost.toFixed(2) : Math.round(cost)}</div><div className="label">Est. cost · {scope.vendor}</div></div>
              </div>
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-primary" disabled={running || scope.candidates === 0} onClick={run}>
                  {running ? 'Finding…' : `Find contacts · ~$${cost < 1 ? cost.toFixed(2) : Math.round(cost)}`}
                </button>
                {running && <span className="muted" style={{ marginLeft: 10 }}><span className="spinner" /> Safe to leave — runs on the server.</span>}
              </div>
            </>
          )}
        </div>
      )}

      {(log.length > 0 || result) && (
        <div className="panel">
          <h3>Results</h3>
          {result && (
            <div className="cards" style={{ marginBottom: 12 }}>
              <div className="card"><div className="num">{Number(result.added ?? 0).toLocaleString()}</div><div className="label">People added</div></div>
              <div className="card"><div className="num">{Number(result.companies ?? 0).toLocaleString()}</div><div className="label">Companies searched</div></div>
            </div>
          )}
          <details open><summary className="muted">Activity</summary>
            <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.7, maxHeight: 180, overflow: 'auto', marginTop: 8 }}>
              {log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </details>
        </div>
      )}
    </>
  );
}
