CREATE TABLE "bias_audit_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"job_id" uuid NOT NULL,
	"dimension" text NOT NULL,
	"outcome" jsonb NOT NULL,
	"all_pass" text DEFAULT 'true' NOT NULL,
	"trigger" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bias_audit_snapshots" ADD CONSTRAINT "bias_audit_snapshots_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bias_audit_snapshots" ADD CONSTRAINT "bias_audit_snapshots_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bias_audit_snapshots_job_idx" ON "bias_audit_snapshots" USING btree ("job_id","created_at");