CREATE TABLE IF NOT EXISTS "classify_proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"proposed_type" text,
	"proposed_sub_type" text,
	"confidence" real,
	"reason" text,
	"signal" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classify_proposals" ADD CONSTRAINT "classify_proposals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "classify_company_idx" ON "classify_proposals" USING btree ("company_id");