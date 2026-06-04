# RevOps Data Hygiene Playbook

The plan for cleaning the GTM Data Engine's CRM data — and turning each cleanup into a permanent,
repeatable system capability. **Philosophy:** every task is run **once now** (manually, to learn),
then **built into the app** as a recipe so it becomes ongoing hygiene. What we learn from the
one-time run (match rates, false positives, confidence thresholds) tunes the productized version.

Grounded in the real, fully-synced CRM (2026-06): **44,303 companies · 85,053 contacts · 51,482 associations.**

---

## Operating principles (apply to every task)
1. **Run-once → productize.** Manual CLI run first → measure → then ship as an app recipe + scheduled job.
2. **Never blind-mutate.** Anything that changes data goes through a **preview/scope** and, where
   judgment is involved (classification, merges), a **review queue** before applying.
3. **Scope + cost up front.** Show candidate count + estimated vendor cost before any spend.
4. **Free before paid.** Exhaust title/domain/rules-based fixes (free) before vendor enrichment.
5. **Provenance.** Every change records its source + timestamp (field_history) so it's auditable/reversible.
6. **Idempotent + resumable.** Re-running is safe; long jobs checkpoint.

---

## The hygiene tasks (priority order)

### 1. Association Repair  ·  FREE  ·  highest leverage
**Problem:** 36,217 contacts (43%) have no company link; **22,001 are auto-linkable** by matching
the contact's email domain → an existing company's domain.
- **Run now:** CLI matches email-domain → company, creates associations (skips ambiguous/none).
- **Productize:** recipe "Repair contact associations" + part of scheduled hygiene. Re-runs as new
  contacts/companies arrive.
- **Learn:** match rate, collisions (multiple companies per domain), personal-email domains to skip.

### 2. Persona Backfill  ·  FREE
**Problem:** 65,059 contacts (76%) have no persona; **20,855 have a job title** → classifiable now
with the existing keyword classifier (free, deterministic). The rest need a title first (→ task 6).
- **Run now:** CLI runs classifyPersona on untagged-but-titled contacts; writes persona.
- **Productize:** recipe "Backfill personas" + auto-tag on every import/pull.
- **Learn:** which titles fall through (improve keyword lists), persona distribution.

### 3. Type / Sub-type Classification  ·  AI (local $0) / paid in-app  ·  BUILT
**Problem:** 92% of companies untyped; ~30k classifiable (have a domain).
- **Run now:** `npm run classify` (claude -p, homepage + Ocean-fallback) → review queue → approve.
- **Productize:** in-app classify with ANTHROPIC_API_KEY (already designed); review UI exists.
- **Learn:** confidence threshold for auto-apply vs review, homepage-fetch success rate, prompt tuning.

### 4. Domain Recovery  ·  FREE-ish
**Problem:** 11,826 companies (27%) have no domain — the master key for matching/dedup/enrichment.
- **Run now:** derive domain from the `website` field; else from associated contacts' email domains;
  else flag for manual. (Free.) Optional paid: name→domain lookup for the remainder.
- **Productize:** recipe "Recover company domains"; run before enrichment/dedup.
- **Learn:** how many recover free vs need a vendor; bad-domain patterns.

### 5. Email Verification at Scale  ·  PAID (Bouncer, gated)  ·  BUILT (verify-stale)
**Problem:** only ~4% of emails verified.
- **Run now:** scoped batches via verify-stale (already shows count + est. cost; TTL-cached).
- **Productize:** exists; add to scheduled hygiene (re-verify past TTL).
- **Learn:** deliverability distribution, cost per 10k, how many role/undeliverable to suppress.

### 6. Title / LinkedIn Backfill  ·  PAID (Airscale)  ·  partial (Find Contacts exists)
**Problem:** 45% of contacts missing title, 62% missing LinkedIn — blocks persona + outreach.
- Use Find Contacts (built) for companies missing people; add a "enrich existing contacts" path.
- **Learn:** Airscale hit rate + cost per contact.

### 7. Field Normalization  ·  FREE
**Problem:** country (US/USA/United States), state codes, casing, employee-size band formats, domain casing.
- **Run now:** deterministic normalizer pass (no vendor).
- **Productize:** normalize-on-write (in the resolve step) + a one-time backfill recipe.
- **Learn:** the actual variant set to canonicalize.

### 8. Bad-data / Junk Detection  ·  FREE
Test/junk records, malformed emails/domains, personal-email-only contacts, "Not a fit"/competitor flags.
- **Run now:** rules pass → flag (not delete) → review queue.
- **Productize:** ongoing flagging + a review surface.

### 9. Deduplication / Merge  ·  FREE detect, reviewed merge
**Problem:** exact-domain dedup works (0 dups), but fuzzy company dups (name variants, www/subdomain,
parent/child) and contact dups (same person, multiple emails) remain.
- **Run now:** detection pass → candidate pairs → review queue → merge (keep golden, fold identifiers/history).
- **Productize:** scheduled dup scan + merge review UI. **Never auto-merge.**
- **Learn:** fuzzy-match precision; what threshold is safe to auto-suggest.

### 10. Sync Drift + Freshness Monitor  ·  FREE  ·  partial (coverage view exists)
What's in HubSpot not here / here not pushed; records not updated in N months; verification past TTL.
- **Productize:** expand the HubSpot connector coverage view + staleness flags.

### 11. Data Health Dashboard  ·  reporting
Fill rates, % typed/verified/associated, dup counts, orphan counts — **trended over time** (snapshots).
- The scoreboard that proves hygiene is working. Build after a few tasks land so there's signal.

---

## Schema expansion (enabler — do early)
The pull currently discards most HubSpot fields. To support segmentation + hygiene:
- **Typed columns** for high-value filterable fields: lifecycle stage, lead status, owner, industry,
  revenue, employee count (int), createdate, last_activity_date, phone, city/state/zip, source.
- **`properties_json` (jsonb)** catch-all to retain ALL other HubSpot fields without per-field
  migrations; promote to a column when a field proves worth filtering on.
- Re-pull once to backfill. Avoids future full re-pulls when we want a new field.

---

## Build sequence (recommended)
**Wave 0 — enabler:** Schema expansion + richer pull (capture everything once).
**Wave 1 — free, high-impact, run-now-then-productize:** Association Repair → Persona Backfill →
Field Normalization → Junk Flagging.
**Wave 2 — AI/paid, scoped:** Type Classification at scale → Domain Recovery → Email Verification →
Title/LinkedIn backfill.
**Wave 3 — judgment/ongoing:** Dedup/Merge review tooling → Sync-drift/Freshness → Data Health Dashboard
→ **Scheduled hygiene jobs** (nightly/weekly) tying it together.

Each task ships as: an engine **recipe** + **scope/cost preview** + (where needed) a **review queue**,
plus an entry in a unified **"Data Hygiene" tab** in the app, and eligibility for the **scheduler**.

---

## "Run once today" checklist (the learning pass)
- [x] Association Repair (free) — expect ~22k links created
- [x] Persona Backfill (free) — expect ~20.8k tagged
- [x] Field Normalization (free)
- [ ] Type Classification — sample 100 → review → tune → scale
Capture metrics from each (match rate, false positives, cost) into this doc to tune the productized recipes.

---

## Wave 1 learning-pass results (run 2026-06-04)

**Association Repair — strong win.**
- Created **22,001** associations (51,482 → **73,483**). Orphan contacts 36,217 → **14,216** (−61%).
- Idempotent confirmed: a second run created 0 new links.
- *Learn:* the email-domain→company-domain match is high-precision and the single highest-leverage
  free task. The remaining 14,216 orphans are personal-email domains (gmail/outlook) or contacts at
  companies not in the store — those need domain recovery (task 4) or a new company first, not repair.

**Persona Backfill — small real yield, but exposed classifier gaps (now fixed).**
- First run tagged **0 of 20,855**. Root cause was NOT a bug in the runner — the ESO persona classifier
  (`persona.ts`) is intentionally strict and ESO-buyer-specific, and the ESO contacts were *already*
  tagged during the original ESO pipeline run (19,994 already had a persona). The untagged remainder is
  mostly general-business titles at non-ESO company types (the CRM now spans 7+ types post-generalization).
- Inspecting the misses surfaced genuine gaps; added safe, high-precision keywords:
  `community lead`, `member experience/success`, `owner/co-owner`→Founder/GP, `cfo/chief financial officer`,
  `chief of staff`, `vice president`→Leadership; guarded the `member` exclusion for member-experience roles
  and the `mentor` exclusion for `startup mentor`.
- After the fix: **1,034 tagged** CRM-wide (228 at typed companies). Spot-checks clean — genuinely
  ambiguous titles (`Partner`, `Director`, `Manager`, `Professor`, `Project Manager`) correctly stay null.
- *Learn:* persona coverage is now 21,028/85,053 (**24.7%**). The 19,821 still-untagged-but-titled are
  ambiguous/non-ESO and should NOT be force-tagged. Bigger future lift comes from titles backfilled by
  Airscale (task 6) feeding the classifier, not from loosening it further.

**Field Normalization — zero candidates (already clean).**
- 0 country variants found — the HubSpot pull already delivers canonical names (`United States`, etc.).
- *Learn:* near-zero yield on the current CRM, but keep the recipe as a guard for **CSV imports**
  (where `US`/`USA`/`UK` raw values do appear). It earns its keep on ingest, not on HubSpot data.

**Implication for the productized recipes:** Association Repair is the flagship free recipe (run on every
import + scheduled). Persona Backfill should run *after* title enrichment, not before. Normalization belongs
in the import path more than as a standalone HubSpot pass. The Data Hygiene tab's candidate counts already
set these expectations honestly (e.g. it will show "0 — already clean" for normalize, which is the right signal).
