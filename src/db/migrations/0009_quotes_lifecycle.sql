ALTER TYPE "public"."quote_status" ADD VALUE 'SENT' BEFORE 'PAID';--> statement-breakpoint
ALTER TYPE "public"."quote_status" ADD VALUE 'ACCEPTED' BEFORE 'PAID';--> statement-breakpoint
ALTER TYPE "public"."quote_status" ADD VALUE 'REJECTED';--> statement-breakpoint
CREATE TABLE "quote_folio_counters" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 2) NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT 0 NOT NULL,
	"line_total" numeric(14, 2) NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "quote_items_quantity_positive" CHECK ("quote_items"."quantity" > 0),
	CONSTRAINT "quote_items_discount_range" CHECK ("quote_items"."discount_percent" >= 0 AND "quote_items"."discount_percent" <= 100)
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "discount" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "valid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "terms" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_id_project_id_unique" UNIQUE("id","project_id");--> statement-breakpoint
ALTER TABLE "quote_folio_counters" ADD CONSTRAINT "quote_folio_counters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_project_id_quotes_fk" FOREIGN KEY ("quote_id","project_id") REFERENCES "public"."quotes"("id","project_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_id_project_id_products_fk" FOREIGN KEY ("product_id","project_id") REFERENCES "public"."products"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_items_quote_id_idx" ON "quote_items" USING btree ("quote_id");--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_client_id_project_id_clients_fk" FOREIGN KEY ("client_id","project_id") REFERENCES "public"."clients"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quotes_project_id_client_id_idx" ON "quotes" USING btree ("project_id","client_id");