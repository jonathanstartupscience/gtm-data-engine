CREATE TABLE IF NOT EXISTS "heyreach_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"heyreach_campaign_id" integer NOT NULL,
	"name" text NOT NULL,
	"status" text,
	"persona" text,
	"sub_type" text,
	"stats_json" jsonb,
	"synced_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "heyreach_push_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer,
	"leads_added" integer,
	"leads_updated" integer,
	"leads_failed" integer,
	"segment_filter_json" jsonb,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "heyreach_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer,
	"heyreach_campaign_id" integer,
	"conversation_id" text,
	"lead_name" text,
	"profile_url" text,
	"company" text,
	"last_message" text,
	"is_positive" boolean DEFAULT false,
	"status" text DEFAULT 'new' NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "heyreach_campaign_idx" ON "heyreach_campaigns" USING btree ("heyreach_campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "heyreach_conv_idx" ON "heyreach_replies" USING btree ("conversation_id");