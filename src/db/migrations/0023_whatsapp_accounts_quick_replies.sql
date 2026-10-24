CREATE TABLE "quick_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"shortcut" varchar(40) NOT NULL,
	"title" varchar(100) NOT NULL,
	"content" text NOT NULL,
	"created_by_user_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quick_replies_content_not_empty" CHECK (length(trim("quick_replies"."content")) > 0)
);
--> statement-breakpoint
CREATE TABLE "whatsapp_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"phone_number_id" varchar(50) NOT NULL,
	"business_account_id" varchar(50),
	"token_encrypted" text NOT NULL,
	"token_last4" varchar(4) NOT NULL,
	"updated_by_user_id" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_replies" ADD CONSTRAINT "quick_replies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quick_replies_project_id_shortcut_unique" ON "quick_replies" USING btree ("project_id","shortcut");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_accounts_project_id_unique" ON "whatsapp_accounts" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_accounts_phone_number_id_unique" ON "whatsapp_accounts" USING btree ("phone_number_id");