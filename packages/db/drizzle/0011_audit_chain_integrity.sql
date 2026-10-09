-- Audit-chain integrity (wave 1.2):
-- 1. Unique (org_id, prev_hash): two concurrent appends that read the same
--    chain head cannot both commit — the second insert fails, so serverless
--    multi-instance writers can no longer fork the chain.
CREATE UNIQUE INDEX IF NOT EXISTS audit_log_org_prev_hash_idx
  ON audit_log (org_id, prev_hash);
CREATE UNIQUE INDEX IF NOT EXISTS audit_log_org_hash_idx
  ON audit_log (org_id, hash);

-- 2. Append-only: reject UPDATE and DELETE at the database level.
CREATE OR REPLACE FUNCTION audit_log_reject_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();

DROP TRIGGER IF EXISTS audit_log_no_delete ON audit_log;
CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_reject_mutation();
