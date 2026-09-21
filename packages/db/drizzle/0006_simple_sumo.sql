CREATE TABLE "candidate_report_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"token" text NOT NULL,
	"message" text,
	"revoked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_links" ALTER COLUMN "created_by" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "candidate_report_links" ADD CONSTRAINT "candidate_report_links_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidate_report_links_token_idx" ON "candidate_report_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "candidate_report_links_candidate_idx" ON "candidate_report_links" USING btree ("candidate_id");