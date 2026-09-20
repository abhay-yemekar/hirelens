-- read_count was generated as jsonb in 0003 and corrected to integer in
-- the schema. Postgres cannot cast jsonb → integer automatically, so the
-- conversion needs an explicit USING extract — guarded so databases that
-- were already hand-migrated (column is integer) skip cleanly.
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
ALTER TABLE "share_links" ALTER COLUMN "read_count" SET NOT NULL;
