CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"event" varchar(60) NOT NULL,
	"status" varchar(10) NOT NULL,
	"attempts" integer NOT NULL,
	"response_status" integer,
	"error" varchar(500),
	"duration_ms" integer,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_deliveries_status_valid" CHECK ("webhook_deliveries"."status" IN ('SUCCESS', 'FAILED'))
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"url" varchar(2048) NOT NULL,
	"description" varchar(200),
	"events" text[] NOT NULL,
	"secret_encrypted" text NOT NULL,
	"secret_prefix" varchar(12) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by_user_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_endpoints_events_not_empty" CHECK (cardinality("webhook_endpoints"."events") > 0)
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "scopes" text[] DEFAULT ARRAY['catalog:read','leads:read','leads:write','quotes:write']::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhook_deliveries_endpoint_id_created_idx" ON "webhook_deliveries" USING btree ("endpoint_id","creado_en");--> statement-breakpoint
CREATE INDEX "webhook_endpoints_project_id_active_idx" ON "webhook_endpoints" USING btree ("project_id","active");