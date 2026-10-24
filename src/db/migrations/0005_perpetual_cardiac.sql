CREATE TYPE "public"."access_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"status" "access_request_status" DEFAULT 'PENDING' NOT NULL,
	"atendido_en" timestamp with time zone,
	"atendido_por_user_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_atendido_por_user_id_users_id_fk" FOREIGN KEY ("atendido_por_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "access_requests_project_email_pending_unique" ON "access_requests" USING btree ("project_id","email") WHERE status = 'PENDING';--> statement-breakpoint
CREATE INDEX "access_requests_project_id_created_at_idx" ON "access_requests" USING btree ("project_id","creado_en");