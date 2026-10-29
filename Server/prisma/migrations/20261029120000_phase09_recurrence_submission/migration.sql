ALTER TABLE "recurrence_instance_tasks"
  ADD COLUMN "task_submission_id" UUID;

ALTER TABLE "recurrence_instance_tasks"
  ADD CONSTRAINT "recurrence_instance_tasks_task_submission_id_fkey"
  FOREIGN KEY ("task_submission_id")
  REFERENCES "task_submissions"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
