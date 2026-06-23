import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, postStream, type Experiment, type ExperimentPreview, type OutboundCampaign } from '../api.js';

/**
 * Experiment detail — adjust arm weights (0 = pause, keeps its leads; higher = more new traffic),
 * preview how new contacts would flow, and push (assign new + send each arm's unsent contacts).
 */
export function ExperimentDetail() {
  const { id } = useParams();
  const expId = Number(id);
  const [exp, setExp] = useState<Experiment | null>(null);
  const [campaigns, setCampaigns] = useState<OutboundCampaign[]>([]);
  const [preview, setPreview] = useState<ExperimentPreview | null>(null);
  const [weights, setWeights] = useState<Record<number, number>>({});
  const [savingW, setSavingW] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushLog, setPushLog] = useState<string[]>([]);
  const [pushResult, setPushResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');

  const campName = (cid: number) => campaigns.find((c) => c.id === cid)?.name ?? `Campaign ${cid}`;

  const refresh = useCallback(() => {
    api.experiments().then((d) => {
      const e = d.experiments.find((x) => x.id === expId) ?? null;
      setExp(e);
      if (e) setWeights(Object.fromEntries(e.arms.map((a) => [a.id, a.weight])));
    });
    api.experimentPreview(expId).then(setPreview).catch(() => {});
  }, [expId]);

  useEffect(() => {
    refresh();
    api.outboundCampaigns().then((d) => setCampaigns(d.campaigns)).catch(() => {});
  }, [refresh]);

  const dirty = exp?.arms.some((a) => weights[a.id] !== a.weight);

  async function saveWeights() {
    if (!exp) return;
    setSavingW(true); setError('');
    try {
      await api.updateExperiment(expId, { armWeights: exp.arms.map((a) => ({ armId: a.id, weight: weights[a.id] ?? a.weight })) });
      refresh();
    } catch (e) { setError(String(e)); } finally { setSavingW(false); }
  }

  async function archiveToggle() {
    if (!exp) return;
    await api.updateExperiment(expId, { status: exp.status === 'archived' ? 'active' : 'archived' });
    refresh();
  }

  async function push() {
    if (!confirm('Assign any new contacts and push each arm’s unsent contacts to Email Bison?')) return;
    setPushing(true); setPushLog([]); setPushResult(null); setError('');
    try {
      await postStream(`/api/outbound/experiments/${expId}/push`, { confirm: true }, (ev, data) => {
        if (ev === 'log') setPushLog((l) => [...l, (data as { message: string }).message]);
        else if (ev === 'done') { setPushResult(data as Record<string, unknown>); refresh(); }
        else if (ev === 'error') setError((data as { message: string }).message);
      });
    } catch (e) { setError(String(e)); } finally { setPushing(false); }
  }

  if (!exp) return <div className="loading">Loading…</div>;

  const newByArm = new Map((preview?.newByArm ?? []).map((n) => [n.armId, n.count]));

  return (
    <>
      <Link to="/experiments" className="muted" style={{ fontSize: 13 }}>← Experiments</Link>
      <h1 className="page-title" style={{ marginTop: 8 }}>{exp.name}</h1>
      <p className="page-sub">
        {exp.persona ?? 'All personas'}{exp.subType ? ` · ${exp.subType}` : ''} · {exp.status}
        {preview ? <> · segment: <strong>{preview.segmentSize.toLocaleString()}</strong> contacts, {preview.unassigned.toLocaleString()} not yet assigned</> : null}
      </p>

      {/* Arms + weights */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Arms</h3>
          <button className="btn" onClick={archiveToggle} style={{ padding: '4px 10px' }}>{exp.status === 'archived' ? 'Reactivate' : 'Archive'}</button>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: '6px 0 12px' }}>
          Weight = share of <em>new</em> contacts. Set to <strong>0</strong> to pause an arm (it keeps the leads it already has; no new ones flow). Raise a winner to send it more.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                <th style={{ padding: '6px 8px' }}>Arm</th><th>Campaign</th>
                <th style={{ width: 90 }}>Weight</th>
                <th style={{ width: 90 }}>Assigned</th><th style={{ width: 80 }}>Pushed</th>
                <th style={{ width: 90 }}>New now</th>
              </tr>
            </thead>
            <tbody>
              {exp.arms.map((a) => {
                const view = preview?.arms.find((v) => v.armId === a.id);
                const paused = (weights[a.id] ?? a.weight) === 0;
                return (
                  <tr key={a.id} style={{ borderTop: '1px solid var(--border)', opacity: paused ? 0.6 : 1 }}>
                    <td style={{ padding: '8px' }}>{a.label ?? `Arm ${a.id}`}{paused && <span className="muted" style={{ fontSize: 11 }}> · paused</span>}</td>
                    <td>{view?.bisonCampaignId ? <Link to={`/campaigns/${a.campaignId}`}>{campName(a.campaignId)}</Link> : <span style={{ color: 'var(--coral)' }}>{campName(a.campaignId)} (not in Bison)</span>}</td>
                    <td><input className="input" type="number" min={0} max={1000} value={weights[a.id] ?? a.weight}
                      onChange={(e) => setWeights((w) => ({ ...w, [a.id]: Number(e.target.value) }))} style={{ width: 70 }} /></td>
                    <td>{view?.assigned ?? 0}</td>
                    <td>{view?.pushed ?? 0}</td>
                    <td>{paused ? '—' : `+${newByArm.get(a.id) ?? 0}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {dirty && (
          <div className="toolbar" style={{ marginTop: 12, marginBottom: 0 }}>
            <button className="btn btn-primary" disabled={savingW} onClick={saveWeights}>{savingW ? 'Saving…' : 'Save weights'}</button>
            <span className="muted" style={{ alignSelf: 'center', fontSize: 13 }}>Changes only affect future traffic; assigned contacts never move.</span>
          </div>
        )}
      </div>

      {/* Push */}
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Distribute &amp; push</h3>
        <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
          Assigns any unassigned contacts to arms (by weight), then pushes each arm’s not-yet-sent contacts
          into its Bison campaign. Re-running only flows new contacts. Only deliverable / risky-catch-all addresses are included.
        </p>
        {preview && preview.unassigned > 0 && (
          <p style={{ fontSize: 14 }}><strong>{preview.unassigned.toLocaleString()}</strong> new contact(s) would be distributed: {preview.newByArm.filter((n) => n.count > 0).map((n) => `${n.label ?? 'arm ' + n.armId} +${n.count}`).join(', ') || '—'}</p>
        )}
        {error && <p style={{ color: 'var(--coral)' }}>{error}</p>}
        <button className="btn btn-primary" disabled={pushing} onClick={push}>{pushing ? <><span className="spinner" /> Pushing…</> : 'Distribute & push'}</button>

        {pushLog.length > 0 && (
          <pre style={{ marginTop: 12, background: 'var(--surface-2, rgba(127,127,127,0.08))', padding: 12, borderRadius: 6, fontSize: 12, maxHeight: 260, overflow: 'auto' }}>
            {pushLog.join('\n')}
          </pre>
        )}
        {pushResult && (
          <p style={{ marginTop: 8 }}>Done. Assigned {String((pushResult as { assignedNew?: number }).assignedNew ?? 0)} new, pushed {String((pushResult as { totalPushed?: number }).totalPushed ?? 0)}{(pushResult as { totalFailed?: number }).totalFailed ? `, ${(pushResult as { totalFailed?: number }).totalFailed} failed` : ''}. <Link to="/performance">Compare arms in Performance →</Link></p>
        )}
      </div>
    </>
  );
}
