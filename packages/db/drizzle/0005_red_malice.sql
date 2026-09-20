CREATE TABLE "portal_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"token" text NOT NULL,
	"submitted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_links" ADD CONSTRAINT "portal_links_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_links_token_idx" ON "portal_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "portal_links_candidate_idx" ON "portal_links" USING btree ("candidate_id");