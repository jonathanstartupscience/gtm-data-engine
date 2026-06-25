import { useState } from 'react';
import { api, postStream, type PushPreview } from '../api.js';
import { PageHeader } from '../components/PageHeader.js';

export function Sync() {
  const [preview, setPreview] = useState<PushPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState('');

  async function runPreview() {
    setLoading(true); setErr(''); setResult(null); setPreview(null);
    try { setPreview(await api.pushPreview(5000)); }
    catch { setErr('Couldn’t build the preview — check the HubSpot connection, then try again.'); }
    setLoading(false);
  }

  async function confirmPush() {
    setPushing(true); setLog([]); setResult(null);
    await postStream('/api/push/execute', { confirm: true, limit: 5000 }, (ev, data) => {
      if (ev === 'log') setLog((l) => [...l, (data as { message: string }).message]);
      else if (ev === 'done') { setResult((data as { stats: Record<string, unknown> }).stats); setPreview(null); }
      else if (ev === 'error') setErr((data as { message: string }).message);
    });
    setPushing(false);
  }

  const willChange = preview ? preview.toCreate + preview.toUpdate : 0;

  return (
    <>
      <PageHeader title="Sync to HubSpot" sub="HubSpot is your system of record — review the preview before anything is written." />

      {!preview && !result && (
        <div className="panel">
          <h3>Review pending changes</h3>
          <p className="muted" style={{ marginTop: -8 }}>Checks each company against HubSpot and shows exactly what would change. Nothing is written until you confirm.</p>
          <button className="btn btn-primary" disabled={loading} onClick={runPreview}>
            {loading ? 'Analyzing…' : 'Preview changes'}
          </button>
          {err && <div className="text-error mt-3">{err}</div>}
        </div>
      )}

      {preview && (
        <>
          <div className="panel mb-4" style={{ borderLeft: willChange ? '3px solid var(--amber)' : '3px solid var(--green)' }}>
            <h3>Change summary</h3>
            <p style={{ fontSize: 15 }}>
              {willChange === 0
                ? 'HubSpot is already up to date — no changes needed.'
                : <>This will <strong>create {preview.toCreate.toLocaleString()}</strong> new {preview.toCreate === 1 ? 'company' : 'companies'} and <strong>update {preview.toUpdate.toLocaleString()}</strong> existing {preview.toUpdate === 1 ? 'record' : 'records'} in HubSpot. {preview.unchanged.toLocaleString()} are already in sync.</>}
            </p>
            <div className="cards mb-0">
              <div className="card"><div className="num">{preview.toCreate.toLocaleString()}</div><div className="label">To create</div></div>
              <div className="card"><div className="num">{preview.toUpdate.toLocaleString()}</div><div className="label">To update</div></div>
              <div className="card"><div className="num">{preview.unchanged.toLocaleString()}</div><div className="label">Unchanged</div></div>
            </div>
            {willChange > 0 && (
              <div className="mt-4" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button className="btn btn-primary" disabled={pushing} onClick={confirmPush}>
                  {pushing ? 'Writing to HubSpot…' : `Confirm & write ${willChange.toLocaleString()} changes`}
                </button>
                <button className="btn" disabled={pushing} onClick={() => setPreview(null)}>Cancel</button>
                {pushing && <span className="muted"><span className="spinner" /> Safe to leave — runs on the server.</span>}
              </div>
            )}
          </div>

          {willChange > 0 && (
            <div className="panel">
              <h3>Line-by-line changes{preview.truncated ? ` (showing first ${preview.changes.length})` : ''}</h3>
              <div className="data-grid">
              <table>
                <thead><tr><th>Company</th><th>Action</th><th>What changes</th></tr></thead>
                <tbody>
                  {preview.changes.map((c) => (
                    <tr key={c.storeId}>
                      <td>{c.name}<div className="muted text-xs">{c.domain}</div></td>
                      <td><span className={`tag ${c.action === 'create' ? 'persona' : 'risky_catchall'}`}>{c.action === 'create' ? 'Create' : 'Update'}</span></td>
                      <td>
                        {c.changes.map((ch, i) => (
                          <div key={i} className="text-sm">
                            <strong>{ch.field}:</strong> <span className="muted">{ch.from}</span> → {ch.to}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </>
      )}

      {pushing && log.length > 0 && (
        <div className="panel mt-4">
          <details open><summary className="muted">Live activity</summary>
            <div className="codeblock mt-2" style={{ maxHeight: 200 }}>
              {log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </details>
        </div>
      )}

      {result && (
        <div className="panel" style={{ borderLeft: '3px solid var(--green)' }}>
          <h3>Done</h3>
          <p style={{ fontSize: 15 }}>
            Wrote to HubSpot: <strong>{Number(result.created ?? 0).toLocaleString()}</strong> created,{' '}
            <strong>{Number(result.updated ?? 0).toLocaleString()}</strong> updated,{' '}
            {Number(result.unchanged ?? 0).toLocaleString()} unchanged
            {Number(result.errors ?? 0) > 0 && <>, {Number(result.errors).toLocaleString()} errors</>}.
          </p>
          <button className="btn" onClick={() => { setResult(null); }}>Done</button>
        </div>
      )}
    </>
  );
}
