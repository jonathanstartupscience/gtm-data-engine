CREATE TABLE IF NOT EXISTS "notify_routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"workspace_id" integer,
	"campaign_id" integer,
	"reps" jsonb NOT NULL,
	"rr_cursor" integer DEFAULT 0 NOT NULL,
	"webhook_url_override" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bison_replies" ADD COLUMN "bison_reply_ext_id" text;--> statement-breakpoint
ALTER TABLE "bison_replies" ADD COLUMN "sender_email_id" integer;--> statement-breakpoint
ALTER TABLE "bison_replies" ADD COLUMN "assigned_rep" text;--> statement-breakpoint
ALTER TABLE "bison_replies" ADD COLUMN "claimed_by" text;--> statement-breakpoint
ALTER TABLE "bison_replies" ADD COLUMN "claimed_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notify_routes" ADD CONSTRAINT "notify_routes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notify_routes" ADD CONSTRAINT "notify_routes_campaign_id_bison_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."bison_campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notify_routes_ws_idx" ON "notify_routes" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notify_routes_camp_idx" ON "notify_routes" USING btree ("campaign_id");