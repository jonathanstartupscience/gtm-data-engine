CREATE TABLE IF NOT EXISTS "experiment_arms" (
	"id" serial PRIMARY KEY NOT NULL,
	"experiment_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"label" text,
	"weight" integer DEFAULT 1 NOT NULL,
	"sequence_template_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "experiment_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"experiment_id" integer NOT NULL,
	"contact_id" integer NOT NULL,
	"arm_id" integer NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"pushed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "experiments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"persona" text,
	"sub_type" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "experiment_arms" ADD CONSTRAINT "experiment_arms_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "experiment_arms" ADD CONSTRAINT "experiment_arms_campaign_id_bison_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."bison_campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_arm_id_experiment_arms_id_fk" FOREIGN KEY ("arm_id") REFERENCES "public"."experiment_arms"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_experiment_contact" ON "experiment_assignments" USING btree ("experiment_id","contact_id");