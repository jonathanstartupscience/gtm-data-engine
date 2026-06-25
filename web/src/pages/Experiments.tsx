import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type Experiment, type OutboundCampaign, type SequenceTemplate, type Sender } from '../api.js';

const PERSONAS = ['', 'ESO Leadership', 'ESO Program', 'ESO Partnerships', 'ESO Founder/GP'];

interface DraftArm { campaignId: number | ''; label: string; weight: number; sequenceTemplateId?: number }
interface BuildArm { sequenceTemplateId: number | ''; label: string; weight: number; senderEmailIds: number[] }

/**
 * Experiments — run many sequences head-to-head against one segment. Each arm is a campaign +
 * a weight; contacts are split deterministically and pinned, so prune/scale only affects new traffic.
 */
export function Experiments() {
  const navigate = useNavigate();
  const [exps, setExps] = useState<Experiment[]>([]);
  const [campaigns, setCampaigns] = useState<OutboundCampaign[]>([]);
  const [sequences, setSequences] = useState<SequenceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Create form
  const [name, setName] = useState('');
  const [persona, setPersona] = useState('ESO Leadership');
  const [subType, setSubType] = useState('');
  const [arms, setArms] = useState<DraftArm[]>([{ campaignId: '', label: '', weight: 1 }]);
  const [showCreate, setShowCreate] = useState(false);

  // "Build from sequences" mode — creates one Bison campaign per chosen sequence + wires the experiment.
  const [showBuild, setShowBuild] = useState(false);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [buildArms, setBuildArms] = useState<BuildArm[]>([{ sequenceTemplateId: '', label: '', weight: 1, senderEmailIds: [] }]);

  function load() {
    api.experiments().then((d) => setExps(d.experiments)).finally(() => setLoading(false));
  }
  useEffect(() => {
    load();
    api.outboundCampaigns().then((d) => setCampaigns(d.campaigns)).catch(() => {});
    api.sequences().then((d) => setSequences(d.sequences)).catch(() => {});
    api.outboundSenders().then((d) => setSenders(d.senders)).catch(() => {});
  }, []);

  const setBArm = (i: number, patch: Partial<BuildArm>) => setBuildArms((a) => a.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const addBArm = () => setBuildArms((a) => [...a, { sequenceTemplateId: '', label: '', weight: 1, senderEmailIds: [] }]);
  const removeBArm = (i: number) => setBuildArms((a) => a.filter((_, idx) => idx !== i));
  const toggleSender = (i: number, sid: number) => setBArm(i, {
    senderEmailIds: buildArms[i].senderEmailIds.includes(sid)
      ? buildArms[i].senderEmailIds.filter((x) => x !== sid)
      : [...buildArms[i].senderEmailIds, sid],
  });
  const validBuildArms = buildArms.filter((a) => a.sequenceTemplateId !== '');
  // Warn if any sender inbox is assigned to more than one arm (breaks per-arm isolation).
  const senderArmCount = new Map<number, number>();
  for (const a of validBuildArms) for (const s of a.senderEmailIds) senderArmCount.set(s, (senderArmCount.get(s) ?? 0) + 1);
  const buildSharesSenders = [...senderArmCount.values()].some((n) => n > 1);
  const canBuild = name.trim() && validBuildArms.length >= 1 && !creating;

  async function build() {
    setCreating(true); setError('');
    try {
      const { experimentId } = await api.buildExperiment({
        name: name.trim(), persona: persona || undefined, subType: subType || undefined,
        sequenceTemplateIds: validBuildArms.map((a) => Number(a.sequenceTemplateId)),
        weights: validBuildArms.map((a) => Number(a.weight)),
        senderMapping: validBuildArms.map((a) => a.senderEmailIds),
        labels: validBuildArms.map((a) => a.label.trim() || ''),
      });
      navigate(`/experiments/${experimentId}`);
    } catch (e) { setError(String(e)); setCreating(false); }
  }

  const setArm = (i: number, patch: Partial<DraftArm>) => setArms((a) => a.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const addArm = () => setArms((a) => [...a, { campaignId: '', label: '', weight: 1 }]);
  const removeArm = (i: number) => setArms((a) => a.filter((_, idx) => idx !== i));

  const validArms = arms.filter((a) => a.campaignId !== '');
  const canCreate = name.trim() && validArms.length >= 1 && !creating;

  async function create() {
    setCreating(true); setError('');
    try {
      const { id } = await api.createExperiment({
        name: name.trim(), persona: persona || undefined, subType: subType || undefined,
        arms: validArms.map((a) => ({
          campaignId: Number(a.campaignId), label: a.label.trim() || undefined,
          weight: Number(a.weight), sequenceTemplateId: a.sequenceTemplateId,
        })),
      });
      navigate(`/experiments/${id}`);
    } catch (e) { setError(String(e)); setCreating(false); }
  }

  return (
    <>
      <h1 className="page-title">Experiments</h1>
      <p className="page-sub">
        Run sequences head-to-head against one audience. Each arm is a campaign with a weight; contacts
        are split by weight and <strong>pinned</strong> to their arm, so pausing a loser or scaling a
        winner never reshuffles anyone already in flight — the comparison stays clean.
      </p>

      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => { setShowBuild((v) => !v); setShowCreate(false); }}>{showBuild ? 'Cancel' : '+ Build from sequences'}</button>
        <button className="btn" onClick={() => { setShowCreate((v) => !v); setShowBuild(false); }}>{showCreate ? 'Cancel' : 'Wire from existing campaigns'}</button>
        <Link to="/campaigns" className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>← Campaigns</Link>
      </div>

      {showBuild && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Build from sequences</h3>
          <p className="muted" style={{ fontSize: 13, marginTop: -4, marginBottom: 8 }}>
            One sequence per arm. Creates a Bison campaign per sequence, attaches its senders, and wires the
            experiment — ready to preview &amp; push. Give each arm its own inboxes; shared inboxes pool the
            daily quota and break per-arm isolation.
          </p>
          <input className="input" style={{ width: '100%', marginBottom: 8 }} placeholder="Name — e.g. ESO Core · 6-style head-to-head"
            value={name} onChange={(e) => setName(e.target.value)} />
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <select className="select" value={persona} onChange={(e) => setPersona(e.target.value)}>
              {PERSONAS.map((p) => <option key={p} value={p}>{p || 'All personas'}</option>)}
            </select>
            <input className="input" placeholder="Sub-type (optional)" value={subType} onChange={(e) => setSubType(e.target.value)} style={{ width: 200 }} />
          </div>

          {sequences.length === 0 && <p style={{ color: 'var(--coral)' }}>No sequences yet. <Link to="/sequences">Write sequences</Link> first.</p>}
          {buildArms.map((a, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 10, marginBottom: 8 }}>
              <div className="toolbar" style={{ marginBottom: 8, alignItems: 'center' }}>
                <select className="select" value={a.sequenceTemplateId} onChange={(e) => setBArm(i, { sequenceTemplateId: e.target.value ? Number(e.target.value) : '' })} style={{ minWidth: 240 }}>
                  <option value="">Pick a sequence…</option>
                  {sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input className="input" placeholder="arm label (optional)" value={a.label} onChange={(e) => setBArm(i, { label: e.target.value })} style={{ width: 180 }} />
                <label className="muted">weight
                  <input className="input" type="number" min={0} max={1000} value={a.weight} onChange={(e) => setBArm(i, { weight: Number(e.target.value) })} style={{ width: 70, marginLeft: 6 }} />
                </label>
                {buildArms.length > 1 && <button className="btn" onClick={() => removeBArm(i)} style={{ padding: '4px 10px' }}>Remove</button>}
              </div>
              <div style={{ fontSize: 12 }}>
                <span className="muted">Senders for this arm ({a.senderEmailIds.length} selected, {senders.filter((s) => a.senderEmailIds.includes(s.id)).reduce((sum, s) => sum + (s.daily_limit ?? 0), 0)}/day):</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {senders.map((s) => {
                    const sel = a.senderEmailIds.includes(s.id);
                    const elsewhere = (senderArmCount.get(s.id) ?? 0) > 1 && sel;
                    return (
                      <label key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: elsewhere ? 'var(--coral)' : undefined }}>
                        <input type="checkbox" checked={sel} onChange={() => toggleSender(i, s.id)} />
                        {s.email}{s.daily_limit ? <span className="muted"> ({s.daily_limit})</span> : null}
                      </label>
                    );
                  })}
                  {senders.length === 0 && <span className="muted">No senders found — check the workspace’s Bison connection.</span>}
                </div>
              </div>
            </div>
          ))}
          <button className="btn" onClick={addBArm} style={{ marginBottom: 12 }}>+ Add arm</button>

          {buildSharesSenders && <p style={{ color: 'var(--coral)', fontSize: 13 }}>⚠ A sender inbox is assigned to more than one arm — the daily quota is pooled and arms compete. Give each arm its own inboxes.</p>}
          {error && <p style={{ color: 'var(--coral)' }}>{error}</p>}
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <button className="btn btn-primary" disabled={!canBuild} onClick={build}>{creating ? 'Building…' : 'Build experiment'}</button>
            {!canBuild && !creating && <span className="muted" style={{ alignSelf: 'center', fontSize: 13 }}>Needs a name and at least one arm with a sequence.</span>}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>New experiment</h3>
          <input className="input" style={{ width: '100%', marginBottom: 8 }} placeholder="Name — e.g. ESO styles · Q3 test"
            value={name} onChange={(e) => setName(e.target.value)} />
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <select className="select" value={persona} onChange={(e) => setPersona(e.target.value)}>
              {PERSONAS.map((p) => <option key={p} value={p}>{p || 'All personas'}</option>)}
            </select>
            <input className="input" placeholder="Sub-type (optional)" value={subType} onChange={(e) => setSubType(e.target.value)} style={{ width: 200 }} />
          </div>

          <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>One campaign per arm. Weight sets each arm's share of new contacts (equal = even split; 0 = paused).</p>
          {campaigns.length === 0 && <p style={{ color: 'var(--coral)' }}>No campaigns yet. <Link to="/campaigns/new">Build campaigns</Link> first — one per sequence you want to test.</p>}
          {arms.map((a, i) => (
            <div key={i} className="toolbar" style={{ marginBottom: 8, alignItems: 'center' }}>
              <select className="select" value={a.campaignId} onChange={(e) => setArm(i, { campaignId: e.target.value ? Number(e.target.value) : '' })} style={{ minWidth: 220 }}>
                <option value="">Pick a campaign…</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input className="input" placeholder="label (optional)" value={a.label} onChange={(e) => setArm(i, { label: e.target.value })} style={{ width: 160 }} />
              <label className="muted">weight
                <input className="input" type="number" min={0} max={1000} value={a.weight} onChange={(e) => setArm(i, { weight: Number(e.target.value) })} style={{ width: 70, marginLeft: 6 }} />
              </label>
              <select className="select" value={a.sequenceTemplateId ?? ''} onChange={(e) => setArm(i, { sequenceTemplateId: e.target.value ? Number(e.target.value) : undefined })} style={{ minWidth: 180 }}>
                <option value="">link sequence (optional)</option>
                {sequences.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {arms.length > 1 && <button className="btn" onClick={() => removeArm(i)} style={{ padding: '4px 10px' }}>Remove</button>}
            </div>
          ))}
          <button className="btn" onClick={addArm} style={{ marginBottom: 12 }}>+ Add arm</button>

          {error && <p style={{ color: 'var(--coral)' }}>{error}</p>}
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <button className="btn btn-primary" disabled={!canCreate} onClick={create}>{creating ? 'Creating…' : 'Create experiment'}</button>
            {!canCreate && !creating && <span className="muted" style={{ alignSelf: 'center', fontSize: 13 }}>Needs a name and at least one arm with a campaign.</span>}
          </div>
        </div>
      )}

      {loading ? <div className="loading">Loading…</div> : exps.length === 0 ? (
        <div className="panel"><p className="muted">No experiments yet. Create one to split an audience across sequences and compare them.</p></div>
      ) : (
        <div className="cards">
          {exps.map((e) => (
            <Link key={e.id} to={`/experiments/${e.id}`} className="panel" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontWeight: 600, fontSize: 16 }}>{e.name}</div>
              <div className="muted" style={{ fontSize: 13, margin: '4px 0' }}>
                {e.arms.length} arm{e.arms.length !== 1 ? 's' : ''}
                {e.persona ? ` · ${e.persona}` : ''}{e.subType ? ` · ${e.subType}` : ''}
                {e.status === 'archived' ? ' · archived' : ''}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {e.arms.filter((a) => a.weight > 0).length} live · {e.arms.filter((a) => a.weight === 0).length} paused
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
