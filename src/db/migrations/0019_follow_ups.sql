CREATE TABLE "follow_ups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"lead_id" uuid NOT NULL,
	"type" varchar(20) DEFAULT 'TASK' NOT NULL,
	"title" varchar(255) NOT NULL,
	"notes" text,
	"due_at" timestamp with time zone NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"assigned_user_id" uuid,
	"created_by_user_id" uuid,
	"completed_at" timestamp with time zone,
	"outcome" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follow_ups_type_valid" CHECK ("follow_ups"."type" IN ('CALL', 'MEETING', 'EMAIL', 'WHATSAPP', 'TASK')),
	CONSTRAINT "follow_ups_status_valid" CHECK ("follow_ups"."status" IN ('PENDING', 'DONE', 'CANCELLED'))
);
--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_lead_id_project_id_leads_fk" FOREIGN KEY ("lead_id","project_id") REFERENCES "public"."leads"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follow_ups_project_id_status_due_at_idx" ON "follow_ups" USING btree ("project_id","status","due_at");--> statement-breakpoint
CREATE INDEX "follow_ups_project_id_lead_id_idx" ON "follow_ups" USING btree ("project_id","lead_id");