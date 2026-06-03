# GTM Data Engine

Ingest any list → resolve against a canonical store → enrich → verify → activate (HubSpot / Email Bison / Heyreach / ads). The reusable evolution of the one-off ESO pipeline.

**Stack:** Node/TypeScript · Express · Drizzle ORM · Postgres · React (web/, later) · deployed on Railway.

## Status
Milestone **M1 — repo, schema, canonical store** (in progress). See `BUILD_PLAN.md` in the ESO Pipeline folder for the full milestone tracker and `DATA_ENGINE_PLAN.md` for architecture.

## Layout
```
src/
  lib/        config (env), http (rate limit + retry)
  db/         Drizzle schema (canonical store), client, migrate
  engine/     pipeline stages + swappable vendor adapters (M2+)
  api/        Express server + routes
scripts/      one-off scripts (seed-eso, etc.)
drizzle/      generated SQL migrations
web/          React UI (M4)
```

## Local dev
```bash
cp .env.example .env        # fill in DATABASE_URL + keys
npm install
npm run db:migrate          # apply schema to your Postgres
npm run dev                 # start API on :3000  → GET /api/health
```

## Canonical store (the spine)
Companies & contacts get stable internal IDs + golden records; every input lands in `raw_records` and resolves against the store, so future lists reconcile automatically. Verification results cache with a TTL. See `src/db/schema.ts`.

## Deploy (Railway)
Push to GitHub `main` → Railway auto-deploys. Add Postgres in Railway (sets `DATABASE_URL`); set the other vars in Railway → Variables. **Set a spending cap + usage alert.**

## Secrets
Never commit `.env`. Keys live in env vars only. See `SECRETS_AND_ACCESS.md`.
