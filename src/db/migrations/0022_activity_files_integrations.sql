CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"type" varchar(40) NOT NULL,
	"lead_id" uuid,
	"client_id" uuid,
	"quote_id" uuid,
	"title" varchar(255) NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lead_id" uuid,
	"client_id" uuid,
	"storage_key" varchar(500) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"mime_type" varchar(150) NOT NULL,
	"size_bytes" integer NOT NULL,
	"source" varchar(20) DEFAULT 'UPLOAD' NOT NULL,
	"uploaded_by_user_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attachments_id_project_id_unique" UNIQUE("id","project_id"),
	CONSTRAINT "attachments_owner_present" CHECK ("attachments"."lead_id" IS NOT NULL OR "attachments"."client_id" IS NOT NULL),
	CONSTRAINT "attachments_size_non_negative" CHECK ("attachments"."size_bytes" >= 0),
	CONSTRAINT "attachments_source_valid" CHECK ("attachments"."source" IN ('UPLOAD', 'WHATSAPP'))
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"prefix" varchar(20) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"created_by_user_id" uuid,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"quote_id" uuid NOT NULL,
	"event_id" varchar(255) NOT NULL,
	"type" varchar(40) NOT NULL,
	"amount" numeric(14, 2),
	"currency" varchar(3),
	"reference" varchar(255),
	"result" varchar(20) NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "contact_position" varchar(100);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "contact_position" varchar(100);--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "origin" varchar(10) DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "type" varchar(20) DEFAULT 'TEXT' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "template_name" varchar(512);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "attachment_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "origin" varchar(10) DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "payment_link_url" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "payment_reference" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_key" varchar(500);--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_lead_id_project_id_leads_fk" FOREIGN KEY ("lead_id","project_id") REFERENCES "public"."leads"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_client_id_project_id_clients_fk" FOREIGN KEY ("client_id","project_id") REFERENCES "public"."clients"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_quote_id_project_id_quotes_fk" FOREIGN KEY ("quote_id","project_id") REFERENCES "public"."quotes"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_lead_id_project_id_leads_fk" FOREIGN KEY ("lead_id","project_id") REFERENCES "public"."leads"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_client_id_project_id_clients_fk" FOREIGN KEY ("client_id","project_id") REFERENCES "public"."clients"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_quote_id_project_id_quotes_fk" FOREIGN KEY ("quote_id","project_id") REFERENCES "public"."quotes"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_project_id_creado_en_idx" ON "activity_events" USING btree ("project_id","creado_en");--> statement-breakpoint
CREATE INDEX "activity_events_project_id_lead_id_idx" ON "activity_events" USING btree ("project_id","lead_id");--> statement-breakpoint
CREATE INDEX "activity_events_project_id_client_id_idx" ON "activity_events" USING btree ("project_id","client_id");--> statement-breakpoint
CREATE INDEX "activity_events_project_id_quote_id_idx" ON "activity_events" USING btree ("project_id","quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_storage_key_unique" ON "attachments" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "attachments_project_id_lead_id_idx" ON "attachments" USING btree ("project_id","lead_id");--> statement-breakpoint
CREATE INDEX "attachments_project_id_client_id_idx" ON "attachments" USING btree ("project_id","client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_keys_key_hash_unique" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_keys_project_id_idx" ON "api_keys" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_event_id_unique" ON "payment_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "payment_events_project_id_quote_id_idx" ON "payment_events" USING btree ("project_id","quote_id");--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_attachment_id_project_id_attachments_fk" FOREIGN KEY ("attachment_id","project_id") REFERENCES "public"."attachments"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_origin_valid" CHECK ("leads"."origin" IN ('MANUAL', 'AI'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_type_valid" CHECK ("messages"."type" IN ('TEXT', 'TEMPLATE', 'IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO', 'OTHER'));--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_origin_valid" CHECK ("quotes"."origin" IN ('MANUAL', 'AI'));
