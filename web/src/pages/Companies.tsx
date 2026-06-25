import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, downloadCsv, type Company } from '../api.js';
import { useTaxonomy } from '../hooks/useTaxonomy.js';
import { SortHeader, DomainLink, nextSort } from '../components/Table.js';
import { SelectionActionBar } from '../components/SelectionActionBar.js';
import { PageHeader } from '../components/PageHeader.js';

const LIMIT = 50;

export function Companies() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [subType, setSubType] = useState('');
  const [country, setCountry] = useState('');
  const [sort, setSort] = useState({ sort: 'name', dir: 'asc' });
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Company[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const { types, facets } = useTaxonomy();
  const countries = facets?.countries ?? [];
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pageAllSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const subTypes = useMemo(() => types.find((t) => t.value === type)?.subTypes ?? [], [types, type]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api.companies({ q, type, subType, country, sort: sort.sort, dir: sort.dir, limit: LIMIT, offset })
        .then((d) => { setRows(d.rows); setTotal(d.total); setLoading(false); });
    }, 200);
    return () => clearTimeout(t);
  }, [q, type, subType, country, sort, offset]);

  const onSort = (c: string) => { setSort((s) => nextSort(s, c)); setOffset(0); };
  const clear = () => { setQ(''); setType(''); setSubType(''); setCountry(''); setOffset(0); };
  const active = q || type || subType || country;
  const exportCsv = () => {
    const params = new URLSearchParams({ q, type, subType, country, sort: sort.sort, dir: sort.dir });
    downloadCsv(`/api/export/companies?${params}`, 'companies.csv').catch((e) => alert('Export failed: ' + e));
  };

  return (
    <>
      <PageHeader
        title="Companies"
        sub={`${total.toLocaleString()} matching${active ? ' (filtered)' : ' in the store'}`}
        action={<button className="btn btn-primary" disabled={total === 0} onClick={exportCsv}>Export {total.toLocaleString()} → CSV</button>}
      />

      <div className="toolbar">
        <input className="input" placeholder="Search name or domain…"
          value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} />
        <select className="select" value={type} onChange={(e) => { setType(e.target.value); setSubType(''); setOffset(0); }}>
          <option value="">All types</option>
          {types.map((t) => <option key={t.value} value={t.value}>{t.label} ({t.count})</option>)}
        </select>
        <select className="select" value={subType} onChange={(e) => { setSubType(e.target.value); setOffset(0); }} disabled={!type}>
          <option value="">{type ? 'All sub-types' : 'Pick a type'}</option>
          {subTypes.map((s) => <option key={s.value} value={s.value}>{s.value} ({s.count})</option>)}
        </select>
        <select className="select" value={country} onChange={(e) => { setCountry(e.target.value); setOffset(0); }}>
          <option value="">All countries</option>
          {countries.map((c) => <option key={c.v} value={c.v}>{c.v} ({c.n})</option>)}
        </select>
        {active && <button className="btn" onClick={clear}>Clear</button>}
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <table>
          <thead><tr>
            <th><input type="checkbox" checked={pageAllSelected}
              onChange={(e) => setSelected((s) => { const n = new Set(s); rows.forEach((r) => e.target.checked ? n.add(r.id) : n.delete(r.id)); return n; })} /></th>
            <SortHeader label="Company" col="name" sort={sort.sort} dir={sort.dir} onSort={onSort} />
            <SortHeader label="Domain" col="domain" sort={sort.sort} dir={sort.dir} onSort={onSort} />
            <SortHeader label="Sub-type" col="subType" sort={sort.sort} dir={sort.dir} onSort={onSort} />
            <SortHeader label="Country" col="country" sort={sort.sort} dir={sort.dir} onSort={onSort} />
            <th>HubSpot</th>
          </tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                <td><Link to={`/companies/${c.id}`}>{c.name ?? '—'}</Link></td>
                <td><DomainLink domain={c.domain} /></td>
                <td>{c.subType && <span className="tag persona">{c.subType}</span>}</td>
                <td className="muted">{[c.city, c.state, c.country].filter(Boolean).join(', ')}</td>
                <td className="muted">{c.hubspotId ? '✓' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="pager">
        <button className="btn" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>← Prev</button>
        <span>{total ? offset + 1 : 0}–{Math.min(offset + LIMIT, total)} of {total}</span>
        <button className="btn" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>Next →</button>
      </div>

      <SelectionActionBar kind="enrich" ids={[...selected]} onClear={() => setSelected(new Set())}
        onDone={() => api.companies({ q, type, subType, country, sort: sort.sort, dir: sort.dir, limit: LIMIT, offset }).then((d) => setRows(d.rows))} />
    </>
  );
}
