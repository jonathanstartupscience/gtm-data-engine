CREATE TABLE IF NOT EXISTS "workspaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"persona" text,
	"bison_base_url" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bison_campaigns" ADD COLUMN "workspace_id" integer;--> statement-breakpoint
ALTER TABLE "bison_push_log" ADD COLUMN "workspace_id" integer;--> statement-breakpoint
ALTER TABLE "bison_replies" ADD COLUMN "workspace_id" integer;--> statement-breakpoint
ALTER TABLE "experiments" ADD COLUMN "workspace_id" integer;--> statement-breakpoint
ALTER TABLE "sequence_templates" ADD COLUMN "workspace_id" integer;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_slug_idx" ON "workspaces" USING btree ("slug");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bison_campaigns" ADD CONSTRAINT "bison_campaigns_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bison_push_log" ADD CONSTRAINT "bison_push_log_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bison_replies" ADD CONSTRAINT "bison_replies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "experiments" ADD CONSTRAINT "experiments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sequence_templates" ADD CONSTRAINT "sequence_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
