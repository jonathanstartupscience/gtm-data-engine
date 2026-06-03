import { useState } from 'react';
import { api, postStream, type ImportPreview } from '../api.js';

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
    } catch (e2) { setErr(`Preview failed: ${e2}`); }
  }

  async function runImport() {
    setBusy(true); setLog([]); setResult(null); setErr('');
    try {
      await postStream('/api/import/run',
        { csv, entityType, mapping, sourceName: fileName || 'CSV upload' },
        (ev, data) => {
          if (ev === 'log') setLog((l) => [...l, (data as { message: string }).message]);
          else if (ev === 'done') { setResult((data as { stats: Record<string, unknown> }).stats); setLog((l) => [...l, '✓ import complete']); }
          else if (ev === 'error') setErr((data as { message: string }).message);
        });
    } catch (e) { setErr(String(e)); }
    setBusy(false);
  }

  return (
    <>
      <div className="eyebrow">Import</div>
      <h1 className="page-title">Bring in a <em>list</em></h1>
      <p className="page-sub">Upload a CSV of companies or people. The engine dedupes it against the store and creates clean records — nothing is duplicated.</p>

      {/* Step 1 — type + file */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>1 · Choose what you're importing</h3>
        <div className="toolbar" style={{ marginBottom: 0 }}>
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

      {err && <div className="panel" style={{ marginBottom: 16, color: 'var(--coral)' }}>{err}</div>}

      {/* Step 2 — mapping */}
      {preview && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <h3>2 · Map your columns</h3>
          <p className="muted" style={{ marginTop: -8 }}>We guessed these from your headers. Adjust any that look wrong; leave blank to skip a field.</p>
          <table>
            <thead><tr><th>Engine field</th><th>Your column</th><th>Sample value</th></tr></thead>
            <tbody>
              {preview.fields.map((field) => {
                const col = mapping[field] ?? '';
                const sample = col ? preview.sample[0]?.[col] ?? '' : '';
                return (
                  <tr key={field}>
                    <td style={{ fontWeight: 500 }}>{field}</td>
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
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" disabled={busy} onClick={runImport}>
              {busy ? 'Importing…' : `Import ${preview.total} ${entityType === 'company' ? 'companies' : 'contacts'}`}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — progress + result */}
      {(log.length > 0 || result) && (
        <div className="panel">
          <h3>3 · Import progress</h3>
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.7, maxHeight: 200, overflow: 'auto' }}>
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
          {result && (
            <div className="cards" style={{ marginTop: 16, marginBottom: 0 }}>
              <div className="card"><div className="num">{String(result.resolved ?? 0)}</div><div className="label">Records resolved</div></div>
              <div className="card"><div className="num">{String((result.companies as number) || (result.contacts as number) || 0)}</div><div className="label">Into the store</div></div>
              <div className="card"><div className="num">{String(result.errors ?? 0)}</div><div className="label">Skipped/errors</div></div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
