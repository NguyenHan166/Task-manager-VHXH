ALTER TYPE "RealtimeOutboxType" ADD VALUE 'MESSAGE_NEW';

ALTER TABLE "notifications" ADD COLUMN "chat_room_id" UUID;
ALTER TABLE "realtime_outbox" ADD COLUMN "message_id" UUID;
ALTER TABLE "realtime_outbox" ADD COLUMN "chat_room_id" UUID;
ALTER TABLE "file_links" ADD COLUMN "message_id" UUID;

CREATE TABLE "recurrence_rules" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "owner_id" UUID NOT NULL,
    "scope" VARCHAR(10) NOT NULL DEFAULT 'ALL',
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "frequency" VARCHAR(10) NOT NULL,
    "due_after_hours" INTEGER NOT NULL,
    "next_run_at" TIMESTAMPTZ(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "recurrence_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recurrence_rules_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "recurrence_rule_assignees" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    CONSTRAINT "recurrence_rule_assignees_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recurrence_rule_assignees_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "recurrence_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "recurrence_rule_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "recurrence_instances" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "period_key" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recurrence_instances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recurrence_instances_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "recurrence_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "recurrence_instance_tasks" (
    "id" UUID NOT NULL,
    "instance_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    CONSTRAINT "recurrence_instance_tasks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recurrence_instance_tasks_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "recurrence_instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "recurrence_instance_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "recurrence_instance_tasks_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "chat_rooms" (
    "id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "title" TEXT,
    "direct_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_room_members" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "last_read_at" TIMESTAMPTZ(3),
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_room_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_room_members_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "chat_room_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chat_messages_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "chat_rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "recurrence_rule_assignees_rule_id_user_id_key" ON "recurrence_rule_assignees"("rule_id", "user_id");
CREATE INDEX "recurrence_rule_assignees_user_id_idx" ON "recurrence_rule_assignees"("user_id");
CREATE INDEX "recurrence_rules_active_next_run_at_idx" ON "recurrence_rules"("active", "next_run_at");
CREATE UNIQUE INDEX "recurrence_instances_rule_id_period_key_key" ON "recurrence_instances"("rule_id", "period_key");
CREATE UNIQUE INDEX "recurrence_instance_tasks_task_id_key" ON "recurrence_instance_tasks"("task_id");
CREATE UNIQUE INDEX "recurrence_instance_tasks_instance_id_user_id_key" ON "recurrence_instance_tasks"("instance_id", "user_id");
CREATE INDEX "recurrence_instance_tasks_user_id_idx" ON "recurrence_instance_tasks"("user_id");
CREATE INDEX "chat_rooms_created_at_idx" ON "chat_rooms"("created_at");
CREATE UNIQUE INDEX "chat_rooms_direct_key_key" ON "chat_rooms"("direct_key");
CREATE UNIQUE INDEX "chat_room_members_room_id_user_id_key" ON "chat_room_members"("room_id", "user_id");
CREATE INDEX "chat_room_members_user_id_last_read_at_idx" ON "chat_room_members"("user_id", "last_read_at");
CREATE INDEX "chat_messages_room_id_created_at_id_idx" ON "chat_messages"("room_id", "created_at", "id");
CREATE INDEX "file_links_message_id_idx" ON "file_links"("message_id");

ALTER TABLE "file_links" ADD CONSTRAINT "file_links_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "chat_messages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
