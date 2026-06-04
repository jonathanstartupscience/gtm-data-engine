CREATE TABLE IF NOT EXISTS "bison_campaign_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"sent" integer,
	"opens" integer,
	"replies" integer,
	"bounces" integer,
	"interested" integer,
	"unsubscribed" integer,
	"per_step_json" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bison_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"bison_campaign_id" integer,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"persona" text,
	"sub_type" text,
	"schedule_json" jsonb,
	"limits_json" jsonb,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"synced_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bison_push_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"run_id" integer,
	"leads_created" integer,
	"leads_attached" integer,
	"segment_filter_json" jsonb,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bison_sender_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"sender_email_id" integer NOT NULL,
	"sender_email" text,
	"daily_limit" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bison_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"step_order" integer NOT NULL,
	"wait_in_days" integer DEFAULT 0 NOT NULL,
	"subject" text,
	"body" text,
	"variant" text,
	"thread_reply" boolean DEFAULT false
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bison_campaign_stats" ADD CONSTRAINT "bison_campaign_stats_campaign_id_bison_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."bison_campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bison_push_log" ADD CONSTRAINT "bison_push_log_campaign_id_bison_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."bison_campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bison_sender_assignments" ADD CONSTRAINT "bison_sender_assignments_campaign_id_bison_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."bison_campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bison_sequences" ADD CONSTRAINT "bison_sequences_campaign_id_bison_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."bison_campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
