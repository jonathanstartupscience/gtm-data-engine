CREATE TABLE IF NOT EXISTS "bison_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer,
	"bison_campaign_id" integer,
	"bison_reply_id" text,
	"lead_email" text,
	"lead_name" text,
	"subject" text,
	"body" text,
	"sentiment" text,
	"is_positive" boolean DEFAULT false,
	"status" text DEFAULT 'new' NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sequence_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"persona" text,
	"steps_json" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bison_reply_dedup_idx" ON "bison_replies" USING btree ("bison_reply_id");