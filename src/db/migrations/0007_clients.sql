CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"company" varchar(255),
	"tax_id" varchar(32),
	"email" varchar(255),
	"phone" varchar(32),
	"notes" text,
	"assigned_user_id" uuid,
	"source_lead_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_id_project_id_unique" UNIQUE("id","project_id")
);
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_source_lead_id_leads_id_fk" FOREIGN KEY ("source_lead_id") REFERENCES "public"."leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_project_id_idx" ON "clients" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "clients_project_id_assigned_user_idx" ON "clients" USING btree ("project_id","assigned_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_project_id_tax_id_unique" ON "clients" USING btree ("project_id","tax_id") WHERE tax_id IS NOT NULL;