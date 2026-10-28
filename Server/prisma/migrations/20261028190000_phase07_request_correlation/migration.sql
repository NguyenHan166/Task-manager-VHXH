ALTER TABLE "task_events"
ADD COLUMN "request_id" VARCHAR(128);

CREATE INDEX "task_events_request_id_created_at_idx"
ON "task_events"("request_id", "created_at");
