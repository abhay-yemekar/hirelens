-- read_count was generated as nullable jsonb in 0003 (stale snapshot) and
-- corrected to integer NOT NULL DEFAULT 0 in the schema. Postgres cannot
-- cast jsonb → integer automatically, so the conversion needs an explicit
-- USING extract — guarded so databases that were already hand-migrated
-- (column already integer) skip cleanly. The NOT NULL / DEFAULT statements
-- are idempotent and bring every fresh database to the schema's real shape.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'share_links' AND column_name = 'read_count' AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE "share_links" ALTER COLUMN "read_count" SET DATA TYPE integer USING (read_count #>> '{}')::integer;
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "share_links" ALTER COLUMN "read_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "share_links" ALTER COLUMN "read_count" SET DEFAULT 0;
