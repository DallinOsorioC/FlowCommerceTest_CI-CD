ALTER TABLE "projects" ALTER COLUMN "quote_tax_percent" SET DEFAULT 12;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "currency" SET DEFAULT 'GTQ';--> statement-breakpoint
-- Ventas = cotizaciones PAID por fecha de pago: las PAID anteriores a paid_at
-- (bloque 5) se rellenan con su ultima actualizacion para no perderlas.
UPDATE "quotes" SET "paid_at" = "actualizado_en" WHERE "status" = 'PAID' AND "paid_at" IS NULL;
