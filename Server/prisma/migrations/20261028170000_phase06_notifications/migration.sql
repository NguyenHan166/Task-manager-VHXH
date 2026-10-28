ALTER TABLE "notifications"
  ALTER COLUMN "task_id" DROP NOT NULL;

ALTER TYPE "NotificationType" ADD VALUE 'TASK_DUE';

CREATE TYPE "RealtimeOutboxType" AS ENUM ('NOTIFICATION_NEW', 'TASK_UPDATED');

CREATE TABLE "realtime_outbox" (
  "id" UUID NOT NULL,
  "type" "RealtimeOutboxType" NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "business_event_id" UUID NOT NULL,
  "task_id" UUID,
  "recipient_id" UUID,
  "notification_id" UUID,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "delivered_at" TIMESTAMPTZ(3),
  "last_error" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "realtime_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "realtime_outbox_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "realtime_outbox_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "realtime_outbox_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "realtime_outbox_idempotency_key_key" ON "realtime_outbox"("idempotency_key");
CREATE UNIQUE INDEX "realtime_outbox_notification_id_key" ON "realtime_outbox"("notification_id");
CREATE INDEX "realtime_outbox_delivery_idx" ON "realtime_outbox"("delivered_at", "next_attempt_at", "created_at");
