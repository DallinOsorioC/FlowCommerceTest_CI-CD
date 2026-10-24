ALTER TABLE "messages" ADD COLUMN "error_message" varchar(500);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "actualizado_en" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Los mensajes entrantes que ya existían se dan por leídos: si no, la bandeja
-- arrancaría con todo el historial marcado como pendiente.
UPDATE "messages" SET "read_at" = "creado_en" WHERE "direction" = 'INBOUND';--> statement-breakpoint
CREATE INDEX "messages_project_id_lead_id_creado_en_idx" ON "messages" USING btree ("project_id","lead_id","creado_en");