CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(40) NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text,
	"entity_type" varchar(20),
	"entity_id" uuid,
	"dedupe_key" varchar(120),
	"read_at" timestamp with time zone,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_project_creado_en_idx" ON "notifications" USING btree ("user_id","project_id","creado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_key_unique" ON "notifications" USING btree ("user_id","dedupe_key") WHERE dedupe_key IS NOT NULL;