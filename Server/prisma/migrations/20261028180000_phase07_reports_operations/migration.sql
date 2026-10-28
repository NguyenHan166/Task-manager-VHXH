CREATE TYPE "BackupRunStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "backup_runs" (
    "id" UUID NOT NULL,
    "scheduled_for" TIMESTAMPTZ(3) NOT NULL,
    "status" "BackupRunStatus" NOT NULL,
    "object_key" TEXT,
    "checksum" TEXT,
    "size_bytes" BIGINT,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "error_code" VARCHAR(80),
    "expired_at" TIMESTAMPTZ(3),
    "source_counts" JSONB,
    "restore_drill_at" TIMESTAMPTZ(3),
    "restore_drill_status" VARCHAR(20),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "backup_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "backup_runs_size_bytes_nonnegative" CHECK ("size_bytes" IS NULL OR "size_bytes" >= 0),
    CONSTRAINT "backup_runs_restore_status_check" CHECK ("restore_drill_status" IS NULL OR "restore_drill_status" IN ('SUCCEEDED', 'FAILED'))
);

CREATE UNIQUE INDEX "backup_runs_scheduled_for_key" ON "backup_runs"("scheduled_for");
CREATE UNIQUE INDEX "backup_runs_object_key_key" ON "backup_runs"("object_key") WHERE "object_key" IS NOT NULL;
CREATE INDEX "backup_runs_status_completed_idx" ON "backup_runs"("status", "completed_at");
CREATE INDEX "backup_runs_expired_completed_idx" ON "backup_runs"("expired_at", "completed_at");

CREATE INDEX "tasks_report_created_idx" ON "tasks"("created_at", "status", "primary_assignee_id", "project_id");
CREATE INDEX "tasks_official_report_idx" ON "tasks"("created_at", "status", "project_id", "primary_assignee_id", "priority") WHERE "type" = 'OFFICIAL' AND "archived_at" IS NULL;
CREATE INDEX "task_participants_report_idx" ON "task_participants"("user_id", "task_id") WHERE "role" = 'COLLABORATOR' AND "invitation_status" = 'ACCEPTED';
CREATE INDEX "audit_logs_action_created_idx" ON "audit_logs"("action", "created_at" DESC, "id" DESC);
CREATE INDEX "audit_logs_entity_created_idx" ON "audit_logs"("entity", "entity_id", "created_at" DESC, "id" DESC);

CREATE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'audit_logs'::regclass
      AND tgname = 'audit_logs_append_only'
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER audit_logs_append_only
    BEFORE UPDATE OR DELETE ON "audit_logs"
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
  END IF;
END;
$$;
