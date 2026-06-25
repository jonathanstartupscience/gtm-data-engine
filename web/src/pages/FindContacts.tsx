import { useEffect, useState, useMemo } from 'react';
import { postStream } from '../api.js';
import { api } from '../api.js';
import { useTaxonomy } from '../hooks/useTaxonomy.js';
import { CostBadge } from '../components/CostBadge.js';
import { ChipInput } from '../components/ChipInput.js';

// Quick-fills — pre-load common title sets. Optional; you can type any titles.
const PERSONA_PRESETS: Record<string, string[]> = {
  'ESO Leadership': ['Executive Director', 'CEO', 'President', 'Managing Director'],
  'ESO Program': ['Program Director', 'Program Manager', 'Accelerator Director', 'Incubator Director'],
  'ESO Partnerships': ['Partnerships', 'Business Development', 'Community Director', 'Ecosystem'],
  'ESO Founder/GP': ['Founder', 'Co-Founder', 'Managing Partner', 'General Partner'],
  'Investor — Partner': ['Partner', 'General Partner', 'Managing Partner', 'Principal'],
  'Provider — Exec': ['CEO', 'Founder', 'VP Sales', 'Head of Partnerships'],
};

/**
 * Find Contacts — COMPANY-FIRST, then precise Airscale people filters. Persona is optional
 * (just a quick-fill for titles); you can search by job titles (include/exclude), location,
 * and keyword for exactly the precision you'd have working in Airscale directly.
 */
export function FindContacts() {
  // Step 1 — which companies
  const [type, setType] = useState('');
  const [subType, setSubType] = useState('');
  const [country, setCountry] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const { types, facets, refresh } = useTaxonomy();
  const countries = facets?.countries ?? [];
  // Step 2 — precise people filters
  const [persona, setPersona] = useState('');         // optional, only tags + quick-fills titles
  const [titlesInclude, setTitlesInclude] = useState<string[]>([]);
  const [titlesExclude, setTitlesExclude] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');

  const [scope, setScope] = useState<{ candidates: number; unit: string; estPeople: number; estCostUsd: number; vendor: string; what: string } | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const subTypes = useMemo(() => types.find((t) => t.value === type)?.subTypes ?? [], [types, type]);
  const hasPeopleFilter = titlesInclude.length > 0 || keyword.trim().length > 0 || !!persona;

  useEffect(() => {
    setScope(null);
    setScopeLoading(true);
    const t = setTimeout(() => {
      api.findContactsScope({ persona: persona || undefined, type: type || undefined, subType: subType || undefined, country: country || undefined, onlyMissing })
        .then(setScope).finally(() => setScopeLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [persona, type, subType, country, onlyMissing]);

  function applyPreset(p: string) {
    setPersona(p);
    if (p && PERSONA_PRESETS[p]) setTitlesInclude((cur) => Array.from(new Set([...cur, ...PERSONA_PRESETS[p]])));
  }

  async function run() {
    setRunning(true); setLog([]); setResult(null);
    await postStream('/api/discover/find-contacts', {
      confirm: true,
      persona: persona || undefined,
      type: type || undefined, subType: subType || undefined, country: country || undefined,
      onlyMissingPersona: onlyMissing,
      titlesInclude: titlesInclude.length ? titlesInclude : undefined,
      titlesExclude: titlesExclude.length ? titlesExclude : undefined,
      locations: locations.length ? locations : undefined,
      keyword: keyword.trim() || undefined,
    }, (ev, data) => {
      if (ev === 'log') setLog((l) => [...l, (data as { message: string }).message]);
      else if (ev === 'done') { setResult((data as { stats: Record<string, unknown> }).stats); refresh(); }
      else if (ev === 'error') setLog((l) => [...l, '✗ ' + (data as { message: string }).message]);
    });
    setRunning(false);
  }

  const cost = scope?.estCostUsd ?? 0;

  return (
    <>
      <h1 className="page-title">Find more <em>contacts</em></h1>
      <p className="page-sub">Pick companies, then filter people by title, exclusions, location, and keyword. Airscale sources the contacts; we verify their emails.</p>

      <div className="panel mb-4">
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
        <label className="row">
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} disabled={!persona} />
          <span className={persona ? '' : 'muted'}>Only companies missing this persona {!persona && '(pick a persona to enable)'}</span>
        </label>
      </div>

      <div className="panel mb-4">
        <h3>2 · Who are you looking for?</h3>
        <p className="muted" style={{ marginTop: -8 }}>No persona required. A preset pre-fills common titles; edit them freely.</p>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label className="muted text-sm">Quick-fill from a persona (optional)</label>
            <select className="select mt-1" value={persona} onChange={(e) => applyPreset(e.target.value)} style={{ display: 'block' }}>
              <option value="">None — I’ll specify titles</option>
              {Object.keys(PERSONA_PRESETS).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="muted text-sm">Job titles to include</label>
            <div className="mt-1"><ChipInput values={titlesInclude} onChange={setTitlesInclude} placeholder="e.g. Director of Partnerships, VP Sales" /></div>
          </div>
          <div>
            <label className="muted text-sm">Job titles to exclude</label>
            <div className="mt-1"><ChipInput values={titlesExclude} onChange={setTitlesExclude} placeholder="e.g. Intern, Assistant" /></div>
          </div>
          <div>
            <label className="muted text-sm">Location (city, region, or country)</label>
            <div className="mt-1"><ChipInput values={locations} onChange={setLocations} placeholder="e.g. New York, California, United Kingdom" /></div>
          </div>
          <div>
            <label className="muted text-sm">Keyword (searches title, bio, skills, education)</label>
            <input className="input mt-1" style={{ width: '100%' }} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. fintech, climate, B2B SaaS" />
          </div>
        </div>
      </div>

      {hasPeopleFilter && (
        <div className="panel mb-4">
          <div className="row-between">
            <h3 style={{ margin: 0 }}>3 · Scope &amp; cost</h3>
            <CostBadge costUsd={cost} unit="run" />
          </div>
          {scopeLoading || !scope ? <p className="muted mt-3">Checking…</p> : (
            <>
              <p className="muted mt-3">{scope.what}</p>
              <div className="cards mb-0">
                <div className="card"><div className="num">{scope.candidates.toLocaleString()}</div><div className="label">{scope.unit}</div></div>
                <div className="card"><div className="num">~{scope.estPeople.toLocaleString()}</div><div className="label">People to source</div></div>
                <div className="card"><div className="num" style={{ color: cost >= 25 ? 'var(--coral)' : undefined }}>${cost < 1 ? cost.toFixed(2) : Math.round(cost)}</div><div className="label">Est. cost · {scope.vendor}</div></div>
              </div>
              <div className="mt-4">
                <button className="btn btn-primary" disabled={running || scope.candidates === 0} onClick={run}>
                  {running ? 'Finding…' : `Find contacts · ~$${cost < 1 ? cost.toFixed(2) : Math.round(cost)}`}
                </button>
                {running && <span className="muted" style={{ marginLeft: 10 }}><span className="spinner" /> Runs on the server — safe to leave.</span>}
              </div>
            </>
          )}
        </div>
      )}

      {(log.length > 0 || result) && (
        <div className="panel">
          <h3>Results</h3>
          {result && (
            <div className="cards mb-3">
              <div className="card"><div className="num">{Number(result.added ?? 0).toLocaleString()}</div><div className="label">People added</div></div>
              <div className="card"><div className="num">{Number(result.companies ?? 0).toLocaleString()}</div><div className="label">Companies searched</div></div>
            </div>
          )}
          <details open><summary className="muted">Activity</summary>
            <div className="mt-2" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.7, maxHeight: 180, overflow: 'auto' }}>
              {log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </details>
        </div>
      )}
    </>
  );
}
