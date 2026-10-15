CREATE TABLE "doctor_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" text NOT NULL,
  "created_by" text,
  "text_hash" text NOT NULL,
  "score" integer NOT NULL,
  "band" text NOT NULL,
  "findings" jsonb NOT NULL,
  "next_steps" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "doctor_reports"
  ADD CONSTRAINT "doctor_reports_org_id_organization_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "doctor_reports"
  ADD CONSTRAINT "doctor_reports_created_by_user_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "doctor_reports_org_created_idx" ON "doctor_reports" USING btree ("org_id","created_at");
--> statement-breakpoint
CREATE INDEX "doctor_reports_text_idx" ON "doctor_reports" USING btree ("text_hash");
