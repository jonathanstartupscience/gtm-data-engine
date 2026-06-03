# GTM Data Engine — User Guide

A practical guide for the Startup Science GTM team. By the end you can find target companies,
clean and enrich your data, verify emails, and push clean lists into HubSpot and Email Bison —
on your own.

**App:** https://gtm.startupscience.io · Sign in with your Startup Science account.

---

## 1. What this is (in one minute)

It's our single source of truth for go-to-market data. You bring in companies and people
(from HubSpot, a CSV, or by discovering new ones); the engine **cleans them, removes duplicates,
fills in missing details, and verifies their emails**; then you push the clean result into the
tools you actually run outreach from.

**The vocabulary:**
- **Company / Contact** — a clean "golden record" with a stable ID. Even if the same company
  arrives from five lists, you see one record.
- **Type / Sub-type** — our HubSpot taxonomy (e.g. Type = ESO, Sub-type = Private Accelerator).
- **Persona** — the kind of buyer a contact is (Leadership, Program, Partnerships, Founder/GP).
- **Email status** — how reachable an email is (Deliverable, Risky (catch-all), Role-based, etc.).
- **Workflow / Run** — one execution of an operation (a sync, an enrichment, a verification).

---

## 2. The tabs

| Tab | What it's for |
|---|---|
| **Dashboard** | A live snapshot — totals and breakdowns by type, sub-type, persona, deliverability. |
| **Find Companies** | Discover NEW target companies similar to ones you already have (via Ocean). |
| **Import** | Upload a CSV of companies or people; it's cleaned and deduped into the store. |
| **Companies** | Browse / filter / sort all companies. Export the filtered set to CSV. |
| **Contacts** | Browse / filter / sort all people, with their company. Export to CSV or ad-audience. |
| **Workflows** | Run operations: sync from HubSpot, enrich, verify emails. |
| **Sync to HubSpot** | Push clean company data back to HubSpot — with a review-and-confirm step. |
| **Email Bison** | Send a campaign-ready segment into a cold-email campaign. |
| **Logs & Health** | Integration status + recent activity. Check here first when something breaks. |

---

## 3. The core loop (how it all fits together)

```
FIND new targets ──┐
IMPORT a list   ───┤──▶ the store cleans + dedupes ──▶ ENRICH (fill gaps) ──▶ VERIFY emails ──┐
SYNC from HubSpot ─┘                                                                          │
                                                                                             ▼
                                          ACTIVATE: Sync to HubSpot · Email Bison · Ad audiences
```

A typical end-to-end flow:
1. **Workflows → Sync companies from HubSpot** (and contacts) to load your CRM.
2. **Find Companies** to add new lookalike targets (optional).
3. **Workflows → Enrich company records** to fill missing firmographics.
4. **Workflows → Verify email deliverability** so you know who's reachable.
5. **Sync to HubSpot** to write the cleaned data back.
6. **Email Bison** / **Contacts → Ad audience** to activate.

---

## 4. How to do common things

### Find new companies to target
Find Companies → pick a **sub-type** (the type fills in automatically) → keep the suggested
example companies you like → choose how many to find → run. New companies are added, deduped.
*(Requires an Ocean plan that includes lookalike search. If it's not enabled you'll get a clear notice.)*

### Import a list
Import → choose Companies or Contacts → pick your CSV → review the column mapping (auto-guessed;
fix anything wrong) → Import. Re-importing the same list updates records, never duplicates them.

### Filter and export a segment
Companies or Contacts → use the filters (type, sub-type, country / persona, email status) and
click column headers to sort → **Export → CSV** downloads exactly what's filtered.
On Contacts, **Ad audience → CSV** gives a hashed-email file for Meta/LinkedIn.

### Verify or enrich
Workflows → choose the operation → **Dry run** to preview for free → **Run** to execute.
Verification skips anything checked in the last 90 days, so you never pay twice.

### Push to HubSpot (safely)
Sync to HubSpot → **Preview changes** (nothing is written) → review the summary and the
line-by-line list → **Confirm & write**. HubSpot stays the system of record.

### Send to an Email Bison campaign
Email Bison → pick the campaign → filter the audience (persona / sub-type) → check the live
count → Send. Only deliverable + catch-all addresses are included automatically.

---

## 5. Good to know

- **Runs happen on the server.** When a workflow is running you can safely leave the page or
  close the tab — find the result later under Recent activity (Workflows) or Logs & Health.
- **Nothing changes in HubSpot without your confirmation.** Sync always previews first.
- **Email safety is automatic.** Cold-email sends exclude role-based / undeliverable / unverified.
- **"?" Help button** (bottom-left) explains whatever page you're on.
- **Stuck?** Logs & Health shows integration status + recent failures with the error.

---

## 6. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| A workflow failed | Open it under Recent activity for the error; check Logs & Health integrations. |
| Email Bison campaigns won't load | Email Bison key or instance URL not set — see Logs & Health. |
| "Find Companies" says plan upgrade needed | Ocean lookalike search isn't on the current plan; enrichment still works. |
| Enrich/verify did nothing | Everything may already be fresh/complete — check the dry-run count. |

---

*This guide is maintained alongside the app. The in-app Help drawer mirrors it per page.*
