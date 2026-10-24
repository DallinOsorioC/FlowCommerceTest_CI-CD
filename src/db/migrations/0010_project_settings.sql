ALTER TABLE "projects" ADD COLUMN "billing_legal_name" varchar(255);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "billing_tax_id" varchar(32);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "billing_address" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "billing_phone" varchar(32);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "billing_email" varchar(255);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "quote_tax_percent" numeric(5, 2) DEFAULT 19 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "quote_folio_prefix" varchar(16) DEFAULT 'COT' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "quote_validity_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "quote_default_terms" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "currency" varchar(3) DEFAULT 'COP' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(32);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "position" varchar(100);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_quote_tax_percent_range" CHECK ("projects"."quote_tax_percent" >= 0 AND "projects"."quote_tax_percent" <= 100);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_quote_validity_days_range" CHECK ("projects"."quote_validity_days" >= 1 AND "projects"."quote_validity_days" <= 3650);