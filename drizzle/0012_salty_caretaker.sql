ALTER TABLE "workspaces" ADD COLUMN "persona_match" text;
--> statement-breakpoint
-- Backfill: ESO contacts are tagged granularly ("ESO Leadership", "ESO Program", …) but the eso
-- workspace's persona is 'eso', so an exact-match segment found 0 rows. Scope eso to the SET via a
-- LIKE pattern. Idempotent and only touches a row that hasn't already set its own pattern.
UPDATE "workspaces" SET "persona_match" = 'ESO %' WHERE "slug" = 'eso' AND "persona_match" IS NULL;