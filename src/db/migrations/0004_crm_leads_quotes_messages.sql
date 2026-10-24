CREATE TYPE "public"."lead_stage" AS ENUM('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('INBOUND', 'OUTBOUND');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID');--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"email" varchar(255),
	"phone" varchar(32),
	"stage" "lead_stage" DEFAULT 'NEW' NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_id_project_id_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"whatsapp_message_id" varchar(255) NOT NULL,
	"direction" "message_direction" NOT NULL,
	"content" text NOT NULL,
	"status" varchar(32) DEFAULT 'SENT' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"folio" varchar(64) NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT 0 NOT NULL,
	"tax" numeric(14, 2) DEFAULT 0 NOT NULL,
	"total" numeric(14, 2) DEFAULT 0 NOT NULL,
	"status" "quote_status" DEFAULT 'DRAFT' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_project_id_leads_fk" FOREIGN KEY ("lead_id","project_id") REFERENCES "public"."leads"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_lead_id_project_id_leads_fk" FOREIGN KEY ("lead_id","project_id") REFERENCES "public"."leads"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_project_id_idx" ON "leads" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "leads_project_id_stage_idx" ON "leads" USING btree ("project_id","stage");--> statement-breakpoint
CREATE INDEX "leads_project_id_email_idx" ON "leads" USING btree ("project_id","email");--> statement-breakpoint
CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "messages_whatsapp_message_id_unique" ON "messages" USING btree ("whatsapp_message_id");--> statement-breakpoint
CREATE INDEX "messages_project_id_idx" ON "messages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "messages_lead_id_idx" ON "messages" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "messages_project_id_direction_idx" ON "messages" USING btree ("project_id","direction");--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_project_id_folio_unique" ON "quotes" USING btree ("project_id","folio");--> statement-breakpoint
CREATE INDEX "quotes_project_id_idx" ON "quotes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "quotes_lead_id_idx" ON "quotes" USING btree ("lead_id");