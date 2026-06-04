import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Sender, type BuildStep, type TaxonomyType } from '../api.js';

const PERSONAS = ['', 'ESO Leadership', 'ESO Program', 'ESO Partnerships', 'ESO Founder/GP'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

const VARS = ['{{first_name}}', '{{last_name}}', '{{company}}', '{{title}}', '{{persona}}', '{{sub_type}}'];

function blankStep(order: number): BuildStep {
  return { order, wait_in_days: order === 1 ? 0 : 3, email_subject: '', email_body: '' };
}

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

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.taxonomy().then((d) => setTypes(d.types));
    api.outboundSenders().then((d) => setSenders(d.senders)).catch((e) => setSendersErr(String(e)));
  }, []);

  useEffect(() => {
    setCount(null);
    const t = setTimeout(() => api.outboundSegmentCount(persona, subType).then((d) => setCount(d.count)).catch(() => setCount(null)), 250);
    return () => clearTimeout(t);
  }, [persona, subType]);

  const allSubTypes = types.flatMap((t) => t.subTypes.map((s) => s.value));

  function setStep(i: number, patch: Partial<BuildStep>) {
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
  }
  function addStep() { setSteps((s) => [...s, blankStep(s.length + 1)]); }
  function removeStep(i: number) { setSteps((s) => s.filter((_, idx) => idx !== i).map((st, idx) => ({ ...st, order: idx + 1 }))); }

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
      <h1 className="page-title">Build a campaign</h1>
      <p className="page-sub">Define it here, create it in Email Bison, then push the audience and launch — all with a preview before anything sends.</p>

      {/* 1 · Name */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>1 · Name</h3>
        <input className="input" style={{ width: '100%' }} placeholder="e.g. ESO Leadership — Q3 Cold Outreach"
          value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      {/* 2 · Audience */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>2 · Audience</h3>
        <div className="toolbar" style={{ marginBottom: 0 }}>
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
            : <><strong>{count.toLocaleString()}</strong> campaign-ready contacts match. <span className="muted">Only deliverable & risky-catch-all addresses are included — role-based, undeliverable, and unverified are excluded automatically.</span></>}
        </p>
      </div>

      {/* 3 · Schedule */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>3 · Sending schedule</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {DAYS.map((d) => (
            <button key={d} type="button"
              className={'btn' + (days.includes(d) ? ' btn-primary' : '')}
              onClick={() => setDays((ds) => ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d])}
              style={{ padding: '6px 12px' }}>{d}</button>
          ))}
        </div>
        <div className="toolbar" style={{ marginBottom: 0, alignItems: 'center' }}>
          <label className="muted">From <input className="input" type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} style={{ minWidth: 0, width: 120 }} /></label>
          <label className="muted">To <input className="input" type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} style={{ minWidth: 0, width: 120 }} /></label>
          <span className="muted">Timezone: {TZ}</span>
        </div>
      </div>

      {/* 4 · Senders */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>4 · Sender inboxes</h3>
        {sendersErr ? <p style={{ color: 'var(--coral)' }}>Couldn’t load senders: {sendersErr}</p>
          : senders.length === 0 ? <p className="muted">No sender inboxes found in this workspace. You can add them in Bison, or attach later.</p>
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {senders.map((s) => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="checkbox" checked={picked.includes(s.id)}
                      onChange={(e) => setPicked((p) => e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id))} />
                    <span>{s.email}{s.name ? ` · ${s.name}` : ''}{s.daily_limit ? ` · ${s.daily_limit}/day` : ''}</span>
                  </label>
                ))}
              </div>
            )}
      </div>

      {/* 5 · Sequence */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <h3>5 · Email sequence</h3>
        <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
          Personalize with: {VARS.map((v) => <code key={v} style={{ marginRight: 6 }}>{v}</code>)}
        </p>
        {steps.map((s, i) => (
          <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong>Step {s.order}</strong>
              <div className="toolbar" style={{ marginBottom: 0, alignItems: 'center' }}>
                <label className="muted">Wait
                  <input className="input" type="number" min={0} max={90} value={s.wait_in_days}
                    onChange={(e) => setStep(i, { wait_in_days: Number(e.target.value) })}
                    style={{ minWidth: 0, width: 70, marginLeft: 6 }} /> days
                </label>
                {steps.length > 1 && <button className="btn" onClick={() => removeStep(i)} style={{ padding: '4px 10px' }}>Remove</button>}
              </div>
            </div>
            <input className="input" style={{ width: '100%', marginBottom: 8 }} placeholder="Subject line"
              value={s.email_subject} onChange={(e) => setStep(i, { email_subject: e.target.value })} />
            <textarea className="input" style={{ width: '100%', minHeight: 140, fontFamily: 'inherit', resize: 'vertical' }}
              placeholder="Email body…  Hi {{first_name}}, …"
              value={s.email_body} onChange={(e) => setStep(i, { email_body: e.target.value })} />
          </div>
        ))}
        <button className="btn" onClick={addStep}>+ Add step</button>
      </div>

      {/* 6 · Create */}
      <div className="panel">
        <h3>6 · Create in Email Bison</h3>
        <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
          This creates the campaign + sequence + schedule in Bison and saves the definition here. It does
          <strong> not </strong> send anything yet — you’ll push the {count?.toLocaleString() ?? ''} contacts and launch from the campaign page.
        </p>
        {error && <p style={{ color: 'var(--coral)' }}>{error}</p>}
        {!stepsValid && <p className="muted">Every step needs a subject and body.</p>}
        <button className="btn btn-primary" disabled={!canCreate} onClick={create}>
          {creating ? <><span className="spinner" /> Creating…</> : 'Create campaign'}
        </button>
      </div>
    </>
  );
}
