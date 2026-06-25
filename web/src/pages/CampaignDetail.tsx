import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { api, postStream, type OutboundCampaign, type SequenceStep, type SenderAssignment, type CampaignStats } from '../api.js';
import { PageHeader, EmptyState } from '../components/PageHeader.js';
import { Breadcrumb } from '../components/Breadcrumb.js';
import { recordRecent } from '../recents.js';

const STATUS_TAG: Record<string, string> = { active: 'deliverable', paused: 'risky_catchall', created: 'role_based', draft: 'unknown', done: 'role_based' };

export function CampaignDetail() {
  const { id } = useParams();
  const cid = Number(id);
  const [params] = useSearchParams();
  const warn = params.get('warn');

  const [campaign, setCampaign] = useState<OutboundCampaign | null>(null);
  const [steps, setSteps] = useState<SequenceStep[]>([]);
  const [senders, setSenders] = useState<SenderAssignment[]>([]);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [segCount, setSegCount] = useState<number | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pushLog, setPushLog] = useState<string[]>([]);
  const [pushResult, setPushResult] = useState<Record<string, unknown> | null>(null);
  const [testEmail, setTestEmail] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.outboundCampaign(cid).then((d) => {
      setCampaign(d.campaign); setSteps(d.steps); setSenders(d.senders); setStats(d.stats);
      if (d.campaign?.name) recordRecent({ to: `/campaigns/${cid}`, label: d.campaign.name, kind: 'campaign' });
      api.outboundSegmentCount(d.campaign.persona ?? '', d.campaign.subType ?? '').then((s) => setSegCount(s.count)).catch(() => {});
    }).catch(() => setErr('Couldn’t load this campaign — it may have been removed, or the connection dropped. Try reloading.')).finally(() => setLoading(false));
  }, [cid]);
  useEffect(load, [load]);

  async function action(label: string, fn: () => Promise<unknown>) {
    setBusy(label); setMsg(''); setErr('');
    try { await fn(); setMsg(`${label} ✓`); load(); }
    catch { setErr(`Couldn’t ${label.toLowerCase()} — this often means a Bison hiccup. Check this workspace’s Bison key on Workspaces, then try again.`); }
    setBusy('');
  }

  async function push() {
    if (!campaign) return;
    setPushing(true); setPushLog([]); setPushResult(null);
    await postStream(`/api/outbound/campaigns/${cid}/push`, { confirm: true }, (ev, data) => {
      if (ev === 'log') setPushLog((l) => [...l, (data as { message: string }).message]);
      else if (ev === 'done') setPushResult(data as Record<string, unknown>);
      else if (ev === 'error') setPushLog((l) => [...l, '✗ ' + (data as { message: string }).message]);
    });
    setPushing(false); load();
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (!campaign) return (
    <div className="panel">
      <EmptyState
        title="Campaign not found"
        hint={err || 'This campaign may have been removed from the workspace.'}
        action={<Link to="/campaigns" className="btn btn-primary">Back to campaigns</Link>}
      />
    </div>
  );

  const inBison = !!campaign.bisonCampaignId;

  return (
    <>
      <Breadcrumb trail={[{ label: 'Campaigns', to: '/campaigns' }]} current={campaign.name} />
      <PageHeader
        title={campaign.name}
        sub={<>
          <span className={'tag ' + (STATUS_TAG[campaign.status] ?? 'unknown')}>{campaign.status}</span>
          {campaign.persona && <> · {campaign.persona}</>}{campaign.subType && <> · {campaign.subType}</>}
          {inBison && <> · Bison #{campaign.bisonCampaignId}</>}
        </>}
      />

      {warn && <div className="callout callout-warn mb-4">Created, but some settings didn’t apply in Bison: <strong>{warn}</strong>. You can fix these in the Bison UI.</div>}
      {msg && <div className="callout callout-ok mb-4">{msg}</div>}
      {err && <div className="callout callout-error mb-4">{err}</div>}

      {/* Audience push */}
      <div className="panel mb-4">
        <div className="row-between">
          <h3 className="mt-0 mb-0">Audience</h3>
          <Link to="/contacts" className="btn btn-sm">View contacts</Link>
        </div>
        {!inBison ? <p className="muted">Not created in Bison yet — can’t push leads.</p> : (
          <>
            <p style={{ fontSize: 15 }}>
              {segCount === null ? 'Counting…' : <><strong>{segCount.toLocaleString()}</strong> deliverable contacts match this campaign’s segment.</>}
            </p>
            {!pushResult ? (
              <button className="btn btn-primary" disabled={pushing || !segCount} onClick={push}>
                {pushing ? <><span className="spinner" /> Pushing…</> : `Push ${segCount?.toLocaleString() ?? ''} contacts to Bison`}
              </button>
            ) : (
              <div className="callout callout-ok">
                <p style={{ fontSize: 15 }}>
                  Pushed: <strong>{Number(pushResult.created ?? 0).toLocaleString()}</strong> created,{' '}
                  {Number(pushResult.attached ?? 0).toLocaleString()} attached{Number(pushResult.failed ?? 0) > 0 && <>, {Number(pushResult.failed).toLocaleString()} failed</>}.
                </p>
                <button className="btn" onClick={() => setPushResult(null)}>Push again</button>
              </div>
            )}
            {pushLog.length > 0 && !pushResult && (
              <details open className="mt-3"><summary className="muted">Live activity</summary>
                <div className="codeblock mt-2" style={{ maxHeight: 180 }}>
                  {pushLog.map((l, i) => <div key={i}>{l}</div>)}
                </div>
              </details>
            )}
          </>
        )}
      </div>

      {/* Launch controls */}
      <div className="panel mb-4">
        <h3>Launch</h3>
        {!inBison ? <p className="muted">Create the campaign in Bison first.</p> : (
          <div className="toolbar mb-0" style={{ alignItems: 'center' }}>
            <button className="btn btn-primary" disabled={busy === 'Launch' || campaign.status === 'active'}
              onClick={() => action('Launch', () => api.outboundLaunch(cid))}>
              {busy === 'Launch' ? 'Launching…' : campaign.status === 'active' ? 'Active' : 'Launch campaign'}
            </button>
            <button className="btn" disabled={busy === 'Pause' || campaign.status !== 'active'}
              onClick={() => action('Pause', () => api.outboundPause(cid))}>Pause</button>
            <span style={{ flex: 1 }} />
            <input className="input" type="email" placeholder="you@startupscience.io" value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)} style={{ minWidth: 220 }} />
            <button className="btn" disabled={!testEmail || busy === 'Send test'}
              onClick={() => action('Send test', () => api.outboundSendTest(cid, testEmail))}>Send test</button>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="panel mb-4">
        <div className="row-between">
          <h3 className="mt-0 mb-0">Performance</h3>
          {inBison && <button className="btn" disabled={busy === 'Refresh stats'} onClick={() => action('Refresh stats', () => api.outboundRefreshStats(cid))}>Refresh</button>}
        </div>
        {stats ? (
          <div className="cards" style={{ marginTop: 14, marginBottom: 0 }}>
            <div className="card"><div className="num">{(stats.sent ?? 0).toLocaleString()}</div><div className="label">Sent</div></div>
            <div className="card"><div className="num">{(stats.opens ?? 0).toLocaleString()}</div><div className="label">Opens</div></div>
            <div className="card"><div className="num">{(stats.replies ?? 0).toLocaleString()}</div><div className="label">Replies</div></div>
            <div className="card"><div className="num">{(stats.interested ?? 0).toLocaleString()}</div><div className="label">Interested</div></div>
            <div className="card"><div className="num">{(stats.bounces ?? 0).toLocaleString()}</div><div className="label">Bounces</div></div>
          </div>
        ) : <p className="muted" style={{ marginTop: 10 }}>No stats yet. {inBison ? 'Refresh once the campaign is sending.' : 'Create in Bison and launch first.'}</p>}
      </div>

      {/* Sequence */}
      <div className="panel">
        <h3>Sequence ({steps.length} step{steps.length !== 1 ? 's' : ''})</h3>
        {steps.map((s) => (
          <div key={s.id} style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 12, margin: '12px 0' }}>
            <div className="muted text-sm">Step {s.stepOrder} · waits {s.waitInDays} day{s.waitInDays !== 1 ? 's' : ''}{s.variant ? ` · variant ${s.variant}` : ''}</div>
            <div style={{ fontWeight: 600, margin: '2px 0' }}>{s.subject}</div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--text-secondary)' }}>{s.body}</div>
          </div>
        ))}
        {senders.length > 0 && <p className="muted mt-3">Senders: {senders.map((s) => s.senderEmail ?? `#${s.senderEmailId}`).join(', ')}</p>}
      </div>
    </>
  );
}
