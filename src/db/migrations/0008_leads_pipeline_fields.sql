CREATE TYPE "public"."lead_source" AS ENUM('REFERRAL', 'WEBSITE', 'WHATSAPP', 'SOCIAL_MEDIA', 'EVENT', 'COLD_OUTREACH', 'OTHER');--> statement-breakpoint
ALTER TYPE "public"."lead_stage" ADD VALUE 'NEGOTIATION' BEFORE 'WON';--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "company" varchar(255);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "source" "lead_source";--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "estimated_value" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "assigned_user_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "interest_product_id" uuid;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "last_contact_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_client_id_project_id_clients_fk" FOREIGN KEY ("client_id","project_id") REFERENCES "public"."clients"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_interest_product_id_project_id_products_fk" FOREIGN KEY ("interest_product_id","project_id") REFERENCES "public"."products"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_project_id_assigned_user_idx" ON "leads" USING btree ("project_id","assigned_user_id");--> statement-breakpoint
CREATE INDEX "leads_project_id_client_id_idx" ON "leads" USING btree ("project_id","client_id");--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_estimated_value_non_negative" CHECK ("leads"."estimated_value" IS NULL OR "leads"."estimated_value" >= 0);