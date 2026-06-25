import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, postStream, type Experiment, type ExperimentPreview, type OutboundCampaign } from '../api.js';
import { PageHeader } from '../components/PageHeader.js';
import { Breadcrumb } from '../components/Breadcrumb.js';
import { recordRecent } from '../recents.js';

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

  useEffect(() => {
    if (exp?.name) recordRecent({ to: `/experiments/${expId}`, label: exp.name, kind: 'experiment' });
  }, [exp?.name, expId]);

  const dirty = exp?.arms.some((a) => weights[a.id] !== a.weight);

  async function saveWeights() {
    if (!exp) return;
    setSavingW(true); setError('');
    try {
      await api.updateExperiment(expId, { armWeights: exp.arms.map((a) => ({ armId: a.id, weight: weights[a.id] ?? a.weight })) });
      refresh();
    } catch { setError('Couldn’t save weights — refresh and try again.'); } finally { setSavingW(false); }
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
    } catch { setError('Push interrupted — the run continues on the server. Reopen this experiment to see the result.'); } finally { setPushing(false); }
  }

  if (!exp) return <div className="loading">Loading…</div>;

  const newByArm = new Map((preview?.newByArm ?? []).map((n) => [n.armId, n.count]));

  return (
    <>
      <Breadcrumb trail={[{ label: 'Experiments', to: '/experiments' }]} current={exp.name} />
      <PageHeader
        title={exp.name}
        sub={<>
          {exp.persona ?? 'All personas'}{exp.subType ? ` · ${exp.subType}` : ''} · {exp.status}
          {preview ? <> · segment: <strong>{preview.segmentSize.toLocaleString()}</strong> contacts, {preview.unassigned.toLocaleString()} not yet assigned</> : null}
        </>}
      />

      {/* Arms + weights */}
      <div className="panel mb-4">
        <div className="row-between">
          <h3 style={{ margin: 0 }}>Arms</h3>
          <button className="btn btn-sm" onClick={archiveToggle}>{exp.status === 'archived' ? 'Reactivate' : 'Archive'}</button>
        </div>
        <p className="muted text-sm" style={{ margin: '6px 0 12px' }}>
          Weight sets each arm's share of <em>new</em> contacts. <strong>0</strong> pauses an arm — it keeps its current leads, gets no new ones. Raise a winner to send it more.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Arm</th><th>Campaign</th>
                <th style={{ width: 90 }}>Weight</th>
                <th style={{ width: 90 }}>Assigned</th><th style={{ width: 80 }}>Pushed</th>
                <th style={{ width: 90 }}>New now</th>
                <th style={{ width: 120 }}>Capacity/day</th>
              </tr>
            </thead>
            <tbody>
              {exp.arms.map((a) => {
                const view = preview?.arms.find((v) => v.armId === a.id);
                const paused = (weights[a.id] ?? a.weight) === 0;
                return (
                  <tr key={a.id} style={{ opacity: paused ? 0.6 : 1 }}>
                    <td>
                      {a.label ?? `Arm ${a.id}`}{paused && <span className="muted" style={{ fontSize: 11 }}> · paused</span>}
                      {view?.unfillableTags?.length ? <span className="text-error" title={`Uses merge tag(s) the push can't fill: ${view.unfillableTags.map((t) => `{${t}}`).join(', ')}`} style={{ fontSize: 11, marginLeft: 6 }}>⚠ blank tags</span> : null}
                    </td>
                    <td>{view?.bisonCampaignId ? <Link to={`/campaigns/${a.campaignId}`}>{campName(a.campaignId)}</Link> : <span className="text-error">{campName(a.campaignId)} (not in Bison)</span>}</td>
                    <td><input className="input" type="number" min={0} max={1000} value={weights[a.id] ?? a.weight}
                      onChange={(e) => setWeights((w) => ({ ...w, [a.id]: Number(e.target.value) }))} style={{ width: 70 }} /></td>
                    <td>{view?.assigned ?? 0}</td>
                    <td>{view?.pushed ?? 0}</td>
                    <td>{paused ? '—' : `+${newByArm.get(a.id) ?? 0}`}</td>
                    <td>
                      {view ? <>{view.dailyCapacity}/day <span className="muted" style={{ fontSize: 11 }}>({view.senderCount} inbox{view.senderCount === 1 ? '' : 'es'})</span></> : '—'}
                      {view?.sharesSenders ? <span className="text-error" title="Shares ≥1 sender inbox with another arm — quota is pooled and arms compete" style={{ fontSize: 11, display: 'block' }}>⚠ shared</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {dirty && (
          <div className="toolbar mt-3 mb-0">
            <button className="btn btn-primary" disabled={savingW} onClick={saveWeights}>{savingW ? 'Saving…' : 'Save weights'}</button>
            <span className="muted text-sm" style={{ alignSelf: 'center' }}>Affects future traffic only — assigned contacts never move.</span>
          </div>
        )}
      </div>

      {/* Push */}
      <div className="panel">
        <h3 className="mt-0">Distribute &amp; push</h3>
        <p className="muted text-sm" style={{ marginTop: -4 }}>
          Assigns unassigned contacts to arms by weight, then pushes each arm’s unsent contacts into its
          Bison campaign. Re-running only flows new contacts. Deliverable and risky catch-all addresses only.
        </p>
        {preview && preview.unassigned > 0 && (
          <p style={{ fontSize: 14 }}><strong>{preview.unassigned.toLocaleString()}</strong> new contact(s) would be distributed: {preview.newByArm.filter((n) => n.count > 0).map((n) => `${n.label ?? 'arm ' + n.armId} +${n.count}`).join(', ') || '—'}</p>
        )}
        {preview?.diagnostics && (
          <div className="text-sm mb-2">
            <p style={{ margin: '0 0 6px' }}>
              Program send capacity: <strong>{preview.diagnostics.totalDailyCapacity}/day</strong> across all distinct sender inboxes.
            </p>
            {preview.diagnostics.warnings.map((w, i) => (
              <p key={i} className="text-error" style={{ margin: '4px 0' }}>⚠ {w}</p>
            ))}
          </div>
        )}
        {error && <p className="text-error">{error}</p>}
        <button className="btn btn-primary" disabled={pushing} onClick={push}>{pushing ? <><span className="spinner" /> Pushing…</> : 'Distribute & push'}</button>

        {pushLog.length > 0 && (
          <pre className="codeblock mt-3">
            {pushLog.join('\n')}
          </pre>
        )}
        {pushResult && (
          <p className="mt-2">Done. Assigned {String((pushResult as { assignedNew?: number }).assignedNew ?? 0)} new, pushed {String((pushResult as { totalPushed?: number }).totalPushed ?? 0)}{(pushResult as { totalFailed?: number }).totalFailed ? `, ${(pushResult as { totalFailed?: number }).totalFailed} failed` : ''}. <Link to="/performance">Compare arms in Performance →</Link></p>
        )}
      </div>
    </>
  );
}
