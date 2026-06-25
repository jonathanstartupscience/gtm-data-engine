import { useEffect, useState } from 'react';
import { postStream } from '../api.js';
import { api } from '../api.js';
import { useTaxonomy } from '../hooks/useTaxonomy.js';
import { CostBadge } from '../components/CostBadge.js';
import { ChipInput } from '../components/ChipInput.js';
import { PageHeader } from '../components/PageHeader.js';

// Quick-fills for common target roles. Optional; type any titles you like.
const TITLE_PRESETS: Record<string, string[]> = {
  'University program leaders': ['Director of Entrepreneurship', 'Entrepreneurship', 'Innovation', 'Accelerator', 'Incubator', 'Tech Transfer', 'Venture', 'Dean'],
  'ESO leadership': ['Executive Director', 'Managing Director', 'CEO', 'President'],
  'Investors': ['Partner', 'General Partner', 'Managing Partner', 'Principal'],
};

type ContactRow = { id: number; firstName: string | null; lastName: string | null; jobTitle: string | null; email: string | null; companyName: string | null; linkedinUrl: string | null };

/**
 * Discover Contacts — PEOPLE-FIRST net-new sourcing. Search Airscale by job title + keyword across
 * ALL companies (not just your account list), resolving each person (and their company) into the
 * store. Emails are found in a SEPARATE, separately-confirmed step (the slow/expensive part), so you
 * can review who you got before paying to find their email.
 */
export function DiscoverContacts() {
  const { refresh } = useTaxonomy();

  // Phase 1 — discover people
  const [titlesInclude, setTitlesInclude] = useState<string[]>([]);
  const [keyword, setKeyword] = useState('');
  const [locations, setLocations] = useState<string[]>([]);
  const [maxLeads, setMaxLeads] = useState(250);
  const [persona, setPersona] = useState('');

  const [scope, setScope] = useState<{ total: number; estLeads: number; estCostUsd: number; vendor: string; what: string } | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  // Phase 2 — find emails
  const [needEmail, setNeedEmail] = useState<ContactRow[]>([]);
  const [emailScope, setEmailScope] = useState<{ billable: number; estCostUsd: number; vendor: string } | null>(null);
  const [emailRunning, setEmailRunning] = useState(false);
  const [emailLog, setEmailLog] = useState<string[]>([]);
  const [emailResult, setEmailResult] = useState<Record<string, unknown> | null>(null);

  const hasFilter = titlesInclude.length > 0 || keyword.trim().length > 0;

  useEffect(() => {
    if (!hasFilter) { setScope(null); return; }
    setScope(null); setScopeLoading(true);
    const t = setTimeout(() => {
      api.discoverContactsScope({ titlesInclude, keyword: keyword.trim() || undefined, locations, maxLeads })
        .then(setScope).finally(() => setScopeLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [titlesInclude, keyword, locations, maxLeads]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyPreset(p: string) {
    if (p && TITLE_PRESETS[p]) setTitlesInclude((cur) => Array.from(new Set([...cur, ...TITLE_PRESETS[p]])));
  }

  async function runDiscover() {
    setRunning(true); setLog([]); setResult(null);
    await postStream('/api/discover/discover-contacts', {
      confirm: true,
      titlesInclude: titlesInclude.length ? titlesInclude : undefined,
      keyword: keyword.trim() || undefined,
      locations: locations.length ? locations : undefined,
      persona: persona.trim() || undefined,
      maxLeads,
      expectedCostUsd: scope?.estCostUsd,
    }, (ev, data) => {
      if (ev === 'log') setLog((l) => [...l, (data as { message: string }).message]);
      else if (ev === 'done') { setResult((data as { stats: Record<string, unknown> }).stats); refresh(); loadNeedEmail(); }
      else if (ev === 'error') setLog((l) => [...l, '✗ ' + (data as { message: string }).message]);
    });
    setRunning(false);
  }

  // Pull the discovered persona's contacts that still lack an email (candidates for the email step).
  async function loadNeedEmail() {
    const { rows } = await api.contacts({ q: '', persona: persona.trim(), emailStatus: '', sort: '', dir: '', limit: 200, offset: 0 });
    const need = rows.filter((r) => !r.email) as ContactRow[];
    setNeedEmail(need);
    if (need.length) api.findEmailsScope(need.map((r) => r.id)).then(setEmailScope);
    else setEmailScope(null);
  }

  async function runFindEmails() {
    if (!needEmail.length) return;
    setEmailRunning(true); setEmailLog([]); setEmailResult(null);
    await postStream('/api/discover/discover-contacts/find-emails', {
      confirm: true, ids: needEmail.map((r) => r.id), expectedCostUsd: emailScope?.estCostUsd,
    }, (ev, data) => {
      if (ev === 'log') setEmailLog((l) => [...l, (data as { message: string }).message]);
      else if (ev === 'done') { setEmailResult((data as { stats: Record<string, unknown> }).stats); refresh(); loadNeedEmail(); }
      else if (ev === 'error') setEmailLog((l) => [...l, '✗ ' + (data as { message: string }).message]);
    });
    setEmailRunning(false);
  }

  const cost = scope?.estCostUsd ?? 0;
  const emailCost = emailScope?.estCostUsd ?? 0;

  return (
    <>
      <PageHeader
        title={<>Discover <em>contacts</em></>}
        sub="Find net-new people by job title and keyword across all companies, then find their emails. Sourcing spends Airscale credits."
      />

      <div className="panel mb-4">
        <h3>1 · Who are you looking for?</h3>
        <p className="muted" style={{ marginTop: -8 }}>This searches everywhere, not just your existing companies. A preset pre-fills common titles; edit freely.</p>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <label className="muted text-sm">Quick-fill titles (optional)</label>
            <select className="select mt-1" defaultValue="" onChange={(e) => applyPreset(e.target.value)} style={{ display: 'block' }}>
              <option value="">None — I’ll specify titles</option>
              {Object.keys(TITLE_PRESETS).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="muted text-sm">Job titles to include</label>
            <div className="mt-1"><ChipInput values={titlesInclude} onChange={setTitlesInclude} placeholder="e.g. Director of Entrepreneurship, Innovation" /></div>
          </div>
          <div>
            <label className="muted text-sm">Keyword (searches title, bio, skills, education)</label>
            <input className="input mt-1" style={{ width: '100%' }} value={keyword} onChange={(e) => setKeyword(e.target.value)} aria-label="Keyword filter" placeholder="e.g. university, college" />
          </div>
          <div>
            <label className="muted text-sm">Location (city, region, or country)</label>
            <div className="mt-1"><ChipInput values={locations} onChange={setLocations} placeholder="e.g. United States, United Kingdom" /></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="muted text-sm">Max people to find</label>
              <input className="input mt-1" type="number" min={1} max={5000} style={{ width: '100%' }} value={maxLeads} onChange={(e) => setMaxLeads(Math.min(Math.max(Number(e.target.value) || 1, 1), 5000))} aria-label="Max leads" />
            </div>
            <div>
              <label className="muted text-sm">Tag discovered contacts as persona (optional)</label>
              <input className="input mt-1" style={{ width: '100%' }} value={persona} onChange={(e) => setPersona(e.target.value)} aria-label="Persona tag" placeholder="e.g. university" />
            </div>
          </div>
        </div>
      </div>

      {hasFilter && (
        <div className="panel mb-4">
          <div className="row-between">
            <h3 style={{ margin: 0 }}>2 · Scope &amp; cost</h3>
            <CostBadge costUsd={cost} unit="run" />
          </div>
          {scopeLoading || !scope ? <p className="muted mt-3">Checking…</p> : (
            <>
              <p className="muted mt-3">{scope.what}</p>
              <div className="cards mb-0">
                <div className="card"><div className="num">{scope.total.toLocaleString()}</div><div className="label">People match</div></div>
                <div className="card"><div className="num">~{scope.estLeads.toLocaleString()}</div><div className="label">Will source (capped)</div></div>
                <div className="card"><div className="num" style={{ color: cost >= 25 ? 'var(--coral)' : undefined }}>${cost < 1 ? cost.toFixed(2) : Math.round(cost)}</div><div className="label">Est. cost · {scope.vendor}</div></div>
              </div>
              <div className="mt-4">
                <button className="btn btn-primary" disabled={running || scope.total === 0} onClick={runDiscover}>
                  {running ? 'Discovering…' : `Discover people · ~$${cost < 1 ? cost.toFixed(2) : Math.round(cost)}`}
                </button>
                {running && <span className="muted" style={{ marginLeft: 10 }}><span className="spinner" /> Runs on the server — safe to leave.</span>}
              </div>
            </>
          )}
        </div>
      )}

      {(log.length > 0 || result) && (
        <div className="panel mb-4">
          <h3>Discovered</h3>
          {result && (
            <div className="cards mb-3">
              <div className="card"><div className="num">{Number(result.added ?? 0).toLocaleString()}</div><div className="label">People added</div></div>
              <div className="card"><div className="num">{Number(result.companiesCreated ?? 0).toLocaleString()}</div><div className="label">Companies</div></div>
              <div className="card"><div className="num">{Number(result.noCompany ?? 0).toLocaleString()}</div><div className="label">No company</div></div>
            </div>
          )}
          <details><summary className="muted">Activity</summary>
            <div className="codeblock mt-2">{log.map((l, i) => <div key={i}>{l}</div>)}</div>
          </details>
        </div>
      )}

      {needEmail.length > 0 && (
        <div className="panel">
          <div className="row-between">
            <h3 style={{ margin: 0 }}>3 · Find emails</h3>
            <CostBadge costUsd={emailCost} unit="run" />
          </div>
          <p className="muted mt-3">{needEmail.length.toLocaleString()} discovered contact(s){persona ? ` tagged "${persona}"` : ''} still need an email. Finding emails is slower and costs more, so it’s a separate step.</p>
          <div className="cards mb-0">
            <div className="card"><div className="num">{(emailScope?.billable ?? needEmail.length).toLocaleString()}</div><div className="label">Will look up</div></div>
            <div className="card"><div className="num" style={{ color: emailCost >= 25 ? 'var(--coral)' : undefined }}>${emailCost < 1 ? emailCost.toFixed(2) : Math.round(emailCost)}</div><div className="label">Est. cost · {emailScope?.vendor ?? 'Airscale'}</div></div>
          </div>
          <div className="mt-4">
            <button className="btn btn-primary" disabled={emailRunning} onClick={runFindEmails}>
              {emailRunning ? 'Finding emails…' : `Find emails · ~$${emailCost < 1 ? emailCost.toFixed(2) : Math.round(emailCost)}`}
            </button>
            {emailRunning && <span className="muted" style={{ marginLeft: 10 }}><span className="spinner" /> Runs on the server — safe to leave.</span>}
          </div>
          {emailResult && (
            <div className="cards mt-4 mb-0">
              <div className="card"><div className="num">{Number(emailResult.emailsFound ?? 0).toLocaleString()}</div><div className="label">Emails found</div></div>
              <div className="card"><div className="num">{Number(emailResult.attempted ?? 0).toLocaleString()}</div><div className="label">Attempted</div></div>
            </div>
          )}
          {emailLog.length > 0 && (
            <details className="mt-3"><summary className="muted">Activity</summary>
              <div className="codeblock mt-2">{emailLog.map((l, i) => <div key={i}>{l}</div>)}</div>
            </details>
          )}
        </div>
      )}
    </>
  );
}
