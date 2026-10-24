ALTER TABLE "clients" DROP CONSTRAINT "clients_source_lead_id_leads_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_lead_id_project_id_leads_fk";
--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_source_lead_id_project_id_leads_fk" FOREIGN KEY ("source_lead_id","project_id") REFERENCES "public"."leads"("id","project_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_lead_id_project_id_leads_fk" FOREIGN KEY ("lead_id","project_id") REFERENCES "public"."leads"("id","project_id") ON DELETE no action ON UPDATE no action;