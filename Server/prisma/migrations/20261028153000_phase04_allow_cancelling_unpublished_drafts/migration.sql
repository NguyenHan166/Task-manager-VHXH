ALTER TABLE "tasks"
  DROP CONSTRAINT "tasks_official_published_check";

ALTER TABLE "tasks"
  ADD CONSTRAINT "tasks_official_published_check"
  CHECK (
    "type" <> 'OFFICIAL'
    OR "status" IN ('DRAFT', 'CANCELLED')
    OR ("primary_assignee_id" IS NOT NULL AND "due_at" IS NOT NULL)
  );
