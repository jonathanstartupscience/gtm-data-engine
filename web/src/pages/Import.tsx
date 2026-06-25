import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, postStream, type ImportPreview } from '../api.js';
import { PageHeader } from '../components/PageHeader.js';

type EntityType = 'company' | 'contact';

export function Import() {
  const [entityType, setEntityType] = useState<EntityType>('company');
  const [fileName, setFileName] = useState('');
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [runId, setRunId] = useState<number | null>(null);
  const [err, setErr] = useState('');

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name); setErr(''); setResult(null); setLog([]);
    const text = await f.text();
    setCsv(text);
    try {
      const p = await api.importPreview(text, entityType);
      setPreview(p); setMapping(p.mapping);
    } catch { setErr('Couldn’t read that file — make sure it’s a valid CSV with a header row, then try again.'); }
  }

  async function runImport() {
    setBusy(true); setLog([]); setResult(null); setErr('');
    try {
      await postStream('/api/import/run',
        { csv, entityType, mapping, sourceName: fileName || 'CSV upload' },
        (ev, data) => {
          if (ev === 'log') setLog((l) => [...l, (data as { message: string }).message]);
          else if (ev === 'done') { const d = data as { stats: Record<string, unknown>; runId: number }; setResult(d.stats); setRunId(d.runId); setLog((l) => [...l, '✓ import complete']); }
          else if (ev === 'error') setErr((data as { message: string }).message);
        });
    } catch { setErr('Import couldn’t start — check your connection and try again.'); }
    setBusy(false);
  }

  return (
    <>
      <PageHeader
        title={<>Bring in a <em>list</em></>}
        sub="Rows are deduped against the store — existing records update, new ones are created."
      />

      {/* Step 1 — type + file */}
      <div className="panel mb-4">
        <h3>1 · Choose what you're importing</h3>
        <div className="toolbar bare mb-0">
          <select className="select" value={entityType}
            onChange={(e) => { setEntityType(e.target.value as EntityType); setPreview(null); setCsv(''); setFileName(''); }}>
            <option value="company">Companies</option>
            <option value="contact">Contacts (people)</option>
          </select>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            Choose CSV file
            <input type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: 'none' }} />
          </label>
          {fileName && <span className="muted">{fileName} · {preview?.total ?? '…'} rows</span>}
        </div>
      </div>

      {err && <div className="callout callout-error mb-4 text-error">{err}</div>}

      {/* Step 2 — mapping */}
      {preview && (() => {
        const mappedCols = new Set(Object.values(mapping).filter(Boolean));
        const unmapped = preview.headers.filter((h) => !mappedCols.has(h));
        // Minimum to resolve a record: company needs name or domain; contact needs an email or a name.
        const required = entityType === 'company' ? ['name', 'domain'] : ['email', 'firstName', 'lastName'];
        const hasKey = entityType === 'company'
          ? !!(mapping.name || mapping.domain)
          : !!(mapping.email || mapping.firstName || mapping.lastName);
        return (
          <div className="panel mb-4">
            <h3>2 · Match your columns to fields</h3>
            <p className="muted" style={{ marginTop: -8 }}>Auto-matched by header name. Adjust any that look wrong; “skip” ignores a field.</p>
            <table>
              <thead><tr><th>Engine field</th><th>Your CSV column</th><th>Sample value</th></tr></thead>
              <tbody>
                {preview.fields.map((field) => {
                  const col = mapping[field] ?? '';
                  const sample = col ? preview.sample[0]?.[col] ?? '' : '';
                  const isReq = required.includes(field);
                  return (
                    <tr key={field}>
                      <td style={{ fontWeight: 500 }}>
                        {field}{isReq && <span className="muted" style={{ fontWeight: 400 }}> · key</span>}
                      </td>
                      <td>
                        <select className="select" value={col}
                          onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value }))}>
                          <option value="">— skip —</option>
                          {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </td>
                      <td className="muted">{sample}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {unmapped.length > 0 && (
              <p className="muted mt-3 text-sm">
                <strong>{unmapped.length}</strong> column{unmapped.length !== 1 ? 's' : ''} not mapped (will be ignored): {unmapped.join(', ')}
              </p>
            )}
            {!hasKey && (
              <p className="text-error text-sm" style={{ marginTop: 10 }}>
                Map at least one key field ({entityType === 'company' ? 'name or domain' : 'email or a name'}) so rows can be matched and deduped.
              </p>
            )}
            <div className="mt-4">
              <button className="btn btn-primary" disabled={busy || !hasKey} onClick={runImport}>
                {busy ? 'Importing…' : `Import ${preview.total} ${entityType === 'company' ? 'companies' : 'contacts'}`}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Step 3 — progress + result */}
      {(log.length > 0 || result) && (
        <div className="panel">
          <h3>3 · Import progress</h3>
          <div className="codeblock" style={{ maxHeight: 200 }}>
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
          {result && (
            <>
              <div className="cards mt-4 mb-0">
                <div className="card"><div className="num">{String(result.total ?? 0)}</div><div className="label">Rows in file</div></div>
                <div className="card"><div className="num">{String(result.resolved ?? 0)}</div><div className="label">Resolved into store</div></div>
                <div className="card"><div className="num">{String((result.companies as number) || (result.contacts as number) || 0)}</div><div className="label">{entityType === 'company' ? 'Companies' : 'Contacts'}</div></div>
                <div className="card"><div className="num">{String(result.errors ?? 0)}</div><div className="label">Skipped (missing fields)</div></div>
              </div>
              <p className="muted" style={{ marginTop: 14 }}>
                Deduped against the store — existing records updated, new ones created.
                {runId != null && <> <Link to="/runs">View the step-by-step breakdown →</Link></>}
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
