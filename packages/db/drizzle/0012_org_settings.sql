CREATE TABLE "org_settings" (
  "org_id" text PRIMARY KEY NOT NULL,
  "llm_provider" jsonb NOT NULL,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "org_settings"
  ADD CONSTRAINT "org_settings_org_id_organization_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
