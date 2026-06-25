import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, type Sender, type BuildStep, type TaxonomyType, type SequenceTemplate } from '../api.js';
import { SequenceStepsEditor, blankStep } from '../components/SequenceStepsEditor.js';
import { PageHeader } from '../components/PageHeader.js';

const PERSONAS = ['', 'ESO Leadership', 'ESO Program', 'ESO Partnerships', 'ESO Founder/GP'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

/** Guided campaign builder: name → audience → schedule → senders → sequence → preview → create. */
export function CampaignBuilder() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [persona, setPersona] = useState('ESO Leadership');
  const [subType, setSubType] = useState('');
  const [types, setTypes] = useState<TaxonomyType[]>([]);
  const [count, setCount] = useState<number | null>(null);

  const [days, setDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [fromTime, setFromTime] = useState('09:00');
  const [toTime, setToTime] = useState('17:00');

  const [senders, setSenders] = useState<Sender[]>([]);
  const [sendersErr, setSendersErr] = useState('');
  const [picked, setPicked] = useState<number[]>([]);

  const [steps, setSteps] = useState<BuildStep[]>([blankStep(1)]);
  const [sequences, setSequences] = useState<SequenceTemplate[]>([]);
  const [attachedSeqId, setAttachedSeqId] = useState<number | ''>('');

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.taxonomy().then((d) => setTypes(d.types));
    api.outboundSenders().then((d) => setSenders(d.senders)).catch((e) => setSendersErr(String(e)));
    api.sequences().then((d) => setSequences(d.sequences)).catch(() => {});
  }, []);

  // Attaching a saved sequence COPIES its steps in (editable here without touching the template).
  function attachSequence(id: number | '') {
    setAttachedSeqId(id);
    if (id === '') return;
    const seq = sequences.find((s) => s.id === id);
    if (seq?.stepsJson?.length) setSteps(seq.stepsJson.map((s, i) => ({ ...s, order: i + 1 })));
  }

  useEffect(() => {
    setCount(null);
    const t = setTimeout(() => api.outboundSegmentCount(persona, subType).then((d) => setCount(d.count)).catch(() => setCount(null)), 250);
    return () => clearTimeout(t);
  }, [persona, subType]);

  const allSubTypes = types.flatMap((t) => t.subTypes.map((s) => s.value));

  const stepsValid = steps.every((s) => s.email_subject.trim() && s.email_body.trim());
  const canCreate = name.trim() && stepsValid && !creating;

  async function create() {
    setCreating(true); setError('');
    try {
      const res = await api.outboundBuild({
        name: name.trim(),
        persona: persona || undefined,
        subType: subType || undefined,
        schedule: { timezone: TZ, days: days.map((d) => ({ day: d, from: fromTime, to: toTime })) },
        senderEmailIds: picked.length ? picked : undefined,
        steps,
      });
      if (res.partialFailures.length) {
        // Created locally + in Bison, but some config steps failed — surface, still go to detail.
        navigate(`/campaigns/${res.id}?warn=${encodeURIComponent(res.partialFailures.join(', '))}`);
      } else {
        navigate(`/campaigns/${res.id}`);
      }
    } catch (e) {
      setError('Could not create the campaign in Bison: ' + String(e));
      setCreating(false);
    }
  }

  return (
    <>
      <PageHeader title="Build a campaign" sub="Nothing sends until you push the audience and launch — this only sets it up in Bison." />

      {/* 1 · Name */}
      <div className="panel mb-4">
        <h3>1 · Name</h3>
        <input className="input" style={{ width: '100%' }} placeholder="e.g. ESO Leadership — Q3 Cold Outreach"
          value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      {/* 2 · Audience */}
      <div className="panel mb-4">
        <h3>2 · Audience</h3>
        <div className="toolbar mb-0">
          <select className="select" value={persona} onChange={(e) => setPersona(e.target.value)}>
            {PERSONAS.map((p) => <option key={p} value={p}>{p || 'All personas'}</option>)}
          </select>
          <select className="select" value={subType} onChange={(e) => setSubType(e.target.value)}>
            <option value="">All sub-types</option>
            {allSubTypes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <p style={{ marginTop: 14, fontSize: 15 }}>
          {count === null ? <span className="muted">Counting deliverable contacts…</span>
            : <><strong>{count.toLocaleString()}</strong> campaign-ready contacts match. <span className="muted">Only deliverable & risky-catch-all addresses are included; role-based, undeliverable, and unverified are excluded.</span></>}
        </p>
      </div>

      {/* 3 · Schedule */}
      <div className="panel mb-4">
        <h3>3 · Sending schedule</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {DAYS.map((d) => (
            <button key={d} type="button"
              className={'btn' + (days.includes(d) ? ' btn-primary' : '')}
              onClick={() => setDays((ds) => ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d])}
              style={{ padding: '6px 12px' }}>{d}</button>
          ))}
        </div>
        <div className="toolbar mb-0" style={{ alignItems: 'center' }}>
          <label className="muted">From <input className="input" type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} style={{ minWidth: 0, width: 120 }} /></label>
          <label className="muted">To <input className="input" type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} style={{ minWidth: 0, width: 120 }} /></label>
          <span className="muted">Timezone: {TZ}</span>
        </div>
      </div>

      {/* 4 · Senders */}
      <div className="panel mb-4">
        <h3>4 · Sender inboxes</h3>
        {sendersErr ? <p className="text-error">Couldn’t load senders: {sendersErr}</p>
          : senders.length === 0 ? <p className="muted">No sender inboxes in this workspace. Add them in Bison, or attach later.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {senders.map((s) => (
                  <label key={s.id} className="row">
                    <input type="checkbox" checked={picked.includes(s.id)}
                      onChange={(e) => setPicked((p) => e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id))} />
                    <span>{s.email}{s.name ? ` · ${s.name}` : ''}{s.daily_limit ? ` · ${s.daily_limit}/day` : ''}</span>
                  </label>
                ))}
              </div>
            )}
      </div>

      {/* 5 · Sequence */}
      <div className="panel mb-4">
        <h3>5 · Email sequence</h3>
        <div className="toolbar mb-3" style={{ alignItems: 'center' }}>
          <label className="muted">Start from a saved sequence:</label>
          <select className="select" value={attachedSeqId} onChange={(e) => attachSequence(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Build from scratch</option>
            {sequences.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.stepsJson.length} steps)</option>)}
          </select>
          <Link to="/sequences/new" className="muted text-sm">+ manage sequences</Link>
        </div>
        {attachedSeqId !== '' && <p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>Copied from the template — edits here don’t change it.</p>}
        <SequenceStepsEditor steps={steps} onChange={setSteps} />
      </div>

      {/* 6 · Create */}
      <div className="panel">
        <h3>6 · Create in Email Bison</h3>
        <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
          Creates the campaign, sequence and schedule in Bison. Sends
          <strong> nothing </strong> yet — push the {count?.toLocaleString() ?? ''} contacts and launch from the campaign page.
        </p>
        {error && <p className="text-error">{error}</p>}
        {!stepsValid && <p className="muted">Every step needs a subject and body.</p>}
        <button className="btn btn-primary" disabled={!canCreate} onClick={create}>
          {creating ? <><span className="spinner" /> Creating…</> : 'Create campaign'}
        </button>
      </div>
    </>
  );
}
