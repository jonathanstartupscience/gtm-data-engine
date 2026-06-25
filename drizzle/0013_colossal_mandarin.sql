ALTER TABLE "bison_replies" ADD COLUMN "triage_category" text;--> statement-breakpoint
ALTER TABLE "bison_replies" ADD COLUMN "triage_actionable" boolean;--> statement-breakpoint
ALTER TABLE "bison_replies" ADD COLUMN "triage_strategy" text;--> statement-breakpoint
ALTER TABLE "bison_replies" ADD COLUMN "referral" jsonb;--> statement-breakpoint
ALTER TABLE "bison_replies" ADD COLUMN "referral_lead_id" integer;--> statement-breakpoint
ALTER TABLE "bison_replies" ADD COLUMN "referral_status" text;