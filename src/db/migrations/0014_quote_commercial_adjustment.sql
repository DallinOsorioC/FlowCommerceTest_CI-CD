ALTER TABLE "quotes" ADD COLUMN "adjustment" numeric(14, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "tax_percent" numeric(5, 2) DEFAULT 12 NOT NULL;--> statement-breakpoint
-- Cotizaciones existentes: se deduce el IVA que se les aplicó (tax / base).
UPDATE "quotes" SET "tax_percent" = round("tax" * 100 / ("subtotal" - "discount"), 2) WHERE "subtotal" - "discount" > 0 AND round("tax" * 100 / ("subtotal" - "discount"), 2) BETWEEN 0 AND 100;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_adjustment_non_negative" CHECK ("quotes"."adjustment" >= 0);--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tax_percent_range" CHECK ("quotes"."tax_percent" >= 0 AND "quotes"."tax_percent" <= 100);
