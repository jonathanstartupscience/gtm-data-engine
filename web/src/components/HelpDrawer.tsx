/** Context-aware help drawer. Explains, in plain language, what the engine is doing
 *  and how — tailored to whichever page the user is on. */

interface Section { heading: string; body: string; }
interface PageHelp { title: string; intro: string; sections: Section[]; steps?: string[]; }

const GENERAL: PageHelp = {
  title: 'What is the GTM Data Engine?',
  intro:
    'It is our single source of truth for go-to-market data. You feed it a list of companies or people; it cleans them, removes duplicates, finds and verifies their emails, tags them, and keeps everything in one place — then pushes the clean result to HubSpot and our outreach tools.',
  sections: [
    { heading: 'Why it exists', body: 'Instead of cleaning a messy list by hand every time, the engine does it consistently and remembers everything. Every new list reconciles against what we already know, so duplicates and stale data stop piling up.' },
    { heading: 'The flow', body: 'Ingest a list → match it against the store (dedupe) → enrich missing data → verify every email → tag persona/firmographics → send to HubSpot, Email Bison, Heyreach, or ad audiences.' },
    { heading: 'The vocabulary', body: 'A “company” and a “contact” are golden records with a stable ID. “Verification” means we checked an email is real and deliverable. A “run” is one execution of a flow (a recipe).' },
  ],
};

const PAGES: Record<string, PageHelp> = {
  '/': {
    title: 'The Dashboard',
    intro: 'A live snapshot of everything in the store right now — how many companies and contacts we hold, and how they break down.',
    sections: [
      { heading: 'The number cards', body: 'Total companies and contacts in the store, plus how many contacts have a deliverable (safe-to-email) address.' },
      { heading: 'The charts', body: 'Companies by sub-type (what kind of organization), contacts by persona (the role we target), and email deliverability (how reachable our contacts are). Healthy data = most emails “deliverable”.' },
    ],
  },
  '/companies': {
    title: 'Companies',
    intro: 'Every organization in the store. Search by name, domain, or sub-type. Click one to see its details and the people we have there.',
    sections: [
      { heading: 'What you can do', body: 'Search and browse. Each company is deduplicated — even if it came in from several lists, you see one clean record with all its known identifiers (domain, LinkedIn, HubSpot ID).' },
      { heading: 'The HubSpot column', body: 'A check means this company is synced to HubSpot. The engine keeps HubSpot as the system of record.' },
    ],
  },
  '/contacts': {
    title: 'Contacts',
    intro: 'Every person in the store. Filter by persona (their role) or by email status (how reachable they are).',
    sections: [
      { heading: 'Persona', body: 'The kind of buyer — e.g. Leadership, Program, Partnerships. We tag this automatically from their job title so you can target the right person.' },
      { heading: 'Email status', body: '“Deliverable” = safe to email. “Risky (catch-all)” = use cautiously. “Role-based” (like info@) = avoid cold email, fine for ads. “Undeliverable” = do not send. These come from real verification.' },
    ],
  },
  '/runs': {
    title: 'Runs — operating the engine',
    intro: 'This is where you actually run a data flow. Pick a recipe, and the engine does the work while you watch the live log.',
    sections: [
      { heading: 'Dry run vs Run', body: '“Dry run” shows you what WOULD happen (and how much it would cost) without spending anything. “Run” does it for real. Always safe to dry-run first.' },
      { heading: 'Verify stale emails', body: 'Finds every email that has never been verified — or whose check is older than 90 days — and re-checks deliverability through Bouncer. Anything still fresh is skipped, so you never pay to re-verify good data.' },
      { heading: 'Run history', body: 'Every run is logged with its result, so there is always a record of what the engine did and when.' },
    ],
    steps: [
      'Click “Dry run” to preview how many records the recipe would touch.',
      'If the preview looks right, click “Run”.',
      'Watch the live output stream as it works.',
      'Review the result summary and the updated data.',
    ],
  },
};

export function HelpDrawer({ page, onClose }: { page: string; onClose: () => void }) {
  const help = PAGES[page] ?? GENERAL;
  return (
    <>
      <div className="help-overlay" onClick={onClose} />
      <div className="help-drawer">
        <button className="help-close" onClick={onClose}>×</button>
        <div className="eyebrow">Help</div>
        <h2>{help.title}</h2>
        <p>{help.intro}</p>

        {help.steps && (
          <>
            <h4>How to use this page</h4>
            {help.steps.map((s, i) => (
              <div className="help-step" key={i}><span className="n">{i + 1}</span><span>{s}</span></div>
            ))}
          </>
        )}

        {help.sections.map((s) => (
          <div key={s.heading}>
            <h4>{s.heading}</h4>
            <p>{s.body}</p>
          </div>
        ))}

        {page !== '/' && (
          <>
            <h4 style={{ marginTop: 28 }}>New here?</h4>
            <p>{GENERAL.intro}</p>
          </>
        )}
      </div>
    </>
  );
}
