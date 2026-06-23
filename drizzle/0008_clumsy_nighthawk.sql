ALTER TABLE "sequence_templates" ADD COLUMN "style_key" text;--> statement-breakpoint
ALTER TABLE "sequence_templates" ADD COLUMN "persona_key" text;--> statement-breakpoint
ALTER TABLE "sequence_templates" ADD COLUMN "pain_key" text;--> statement-breakpoint
ALTER TABLE "sequence_templates" ADD COLUMN "pain_label" text;--> statement-breakpoint
ALTER TABLE "sequence_templates" ADD COLUMN "lead_magnet_id" text;--> statement-breakpoint
ALTER TABLE "sequence_templates" ADD COLUMN "sender_mode" text;--> statement-breakpoint
ALTER TABLE "sequence_templates" ADD COLUMN "ab_variant" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "sequence_templates" ADD COLUMN "rationale" text;--> statement-breakpoint
ALTER TABLE "sequence_templates" ADD COLUMN "gen_model" text;--> statement-breakpoint
ALTER TABLE "sequence_templates" ADD COLUMN "generated_at" timestamp;