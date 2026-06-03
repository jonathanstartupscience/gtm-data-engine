CREATE TABLE IF NOT EXISTS "companies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"domain" text,
	"website" text,
	"type" text,
	"sub_type" text,
	"audience_type" text,
	"country" text,
	"state" text,
	"city" text,
	"linkedin_url" text,
	"founded_year" text,
	"size_employees" text,
	"sector" text,
	"focus" text,
	"hubspot_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_field_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"field" text NOT NULL,
	"value" text,
	"source" text,
	"confidence" real,
	"ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_identifiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_company" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"company_id" integer NOT NULL,
	"role" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_field_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"field" text NOT NULL,
	"value" text,
	"source" text,
	"confidence" real,
	"ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contact_identifiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text,
	"last_name" text,
	"email" text,
	"job_title" text,
	"persona" text,
	"linkedin_url" text,
	"email_status" text,
	"hubspot_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hubspot_sync" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"hubspot_id" text,
	"action" text,
	"overwrote" text,
	"last_synced" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "raw_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"entity_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"row_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"stats" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"meta" jsonb,
	"ingested_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staged_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"raw_id" integer NOT NULL,
	"entity_type" text NOT NULL,
	"normalized" jsonb NOT NULL,
	"resolved_company_id" integer,
	"resolved_contact_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verifications" (
	"email" text PRIMARY KEY NOT NULL,
	"status" text,
	"score" integer,
	"accept_all" boolean,
	"role_based" boolean,
	"disposable" boolean,
	"reason" text,
	"verified_at" timestamp DEFAULT now() NOT NULL,
	"ttl_days" integer DEFAULT 90 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_field_history" ADD CONSTRAINT "company_field_history_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_identifiers" ADD CONSTRAINT "company_identifiers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_company" ADD CONSTRAINT "contact_company_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_company" ADD CONSTRAINT "contact_company_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_field_history" ADD CONSTRAINT "contact_field_history_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contact_identifiers" ADD CONSTRAINT "contact_identifiers_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "raw_records" ADD CONSTRAINT "raw_records_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staged_records" ADD CONSTRAINT "staged_records_raw_id_raw_records_id_fk" FOREIGN KEY ("raw_id") REFERENCES "public"."raw_records"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "companies_domain_idx" ON "companies" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "company_ident_kv_idx" ON "company_identifiers" USING btree ("kind","value");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contact_company_pair_idx" ON "contact_company" USING btree ("contact_id","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contact_ident_kv_idx" ON "contact_identifiers" USING btree ("kind","value");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_email_idx" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_src_idx" ON "raw_records" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "raw_hash_idx" ON "raw_records" USING btree ("row_hash");