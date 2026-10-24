CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"category" varchar(100),
	"unit" varchar(50),
	"price" numeric(14, 2) DEFAULT 0 NOT NULL,
	"max_discount_percent" numeric(5, 2) DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_id_project_id_unique" UNIQUE("id","project_id"),
	CONSTRAINT "products_price_non_negative" CHECK ("products"."price" >= 0),
	CONSTRAINT "products_max_discount_range" CHECK ("products"."max_discount_percent" >= 0 AND "products"."max_discount_percent" <= 100)
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "products_project_id_name_unique" ON "products" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "products_project_id_active_idx" ON "products" USING btree ("project_id","active");