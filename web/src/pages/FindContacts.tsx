import { useEffect, useState, useMemo } from 'react';
import { postStream } from '../api.js';
import { api } from '../api.js';
import { useTaxonomy } from '../hooks/useTaxonomy.js';
import { CostBadge } from '../components/CostBadge.js';
import { ChipInput } from '../components/ChipInput.js';

// Optional quick-fills — pre-load common title sets. Not required; you can type any titles.
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
      <p className="page-sub">Pick the companies, then search people with the same precision as Airscale — job titles, exclusions, location, and keywords. Airscale sources the contacts and we verify their emails.</p>

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
          <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} disabled={!persona} />
          <span className={persona ? '' : 'muted'}>Only companies that don’t already have the selected persona {!persona && '(pick a persona to enable)'}</span>
        </label>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>2 · Who are you looking for?</h3>
        <p className="muted" style={{ marginTop: -8 }}>Search by job title and more — no persona required. Optionally pick a preset to pre-fill common titles, then edit freely.</p>

        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label className="muted" style={{ fontSize: 13 }}>Quick-fill from a persona (optional)</label>
            <select className="select" value={persona} onChange={(e) => applyPreset(e.target.value)} style={{ display: 'block', marginTop: 4 }}>
              <option value="">None — I’ll specify titles</option>
              {Object.keys(PERSONA_PRESETS).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="muted" style={{ fontSize: 13 }}>Job titles to include</label>
            <div style={{ marginTop: 4 }}><ChipInput values={titlesInclude} onChange={setTitlesInclude} placeholder="e.g. Director of Partnerships, VP Sales — Enter or comma to add" /></div>
          </div>
          <div>
            <label className="muted" style={{ fontSize: 13 }}>Job titles to exclude</label>
            <div style={{ marginTop: 4 }}><ChipInput values={titlesExclude} onChange={setTitlesExclude} placeholder="e.g. Intern, Assistant" /></div>
          </div>
          <div>
            <label className="muted" style={{ fontSize: 13 }}>Location (city, region, or country)</label>
            <div style={{ marginTop: 4 }}><ChipInput values={locations} onChange={setLocations} placeholder="e.g. New York, California, United Kingdom" /></div>
          </div>
          <div>
            <label className="muted" style={{ fontSize: 13 }}>Keyword (searches title, bio, skills, education)</label>
            <input className="input" style={{ width: '100%', marginTop: 4 }} value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. fintech, climate, B2B SaaS" />
          </div>
        </div>
      </div>

      {hasPeopleFilter && (
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
