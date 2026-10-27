-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('MANAGER', 'DEPUTY_MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('OFFICIAL', 'TEAM', 'PERSONAL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('COLLABORATOR', 'WATCHER');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('PENDING', 'APPROVED', 'RETURNED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('UPLOADING', 'READY', 'REMOVED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TASK_ASSIGNED', 'TASK_UPDATED', 'TASK_DUE_SOON', 'TASK_OVERDUE', 'SUBMISSION_RECEIVED', 'SUBMISSION_WITHDRAWN', 'SUBMISSION_RETURNED', 'SUBMISSION_APPROVED', 'DEADLINE_REQUESTED', 'ASSIGNEE_REQUESTED', 'REQUEST_DECIDED', 'COMMENT_ADDED', 'TEAM_INVITED', 'CHAT_MESSAGE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "password_hash" TEXT NOT NULL,
    "job_title" TEXT NOT NULL DEFAULT '',
    "phone_number" TEXT,
    "department" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "last_login_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "rotated_from_id" UUID,
    "device" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "workspace_name" TEXT NOT NULL DEFAULT 'Office Workspace',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "default_due_hour" INTEGER NOT NULL DEFAULT 16,
    "reminder_before_hours" INTEGER NOT NULL DEFAULT 24,
    "max_file_size_mb" INTEGER NOT NULL DEFAULT 20,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_code_counters" (
    "prefix" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "next_value" INTEGER NOT NULL,

    CONSTRAINT "business_code_counters_pkey" PRIMARY KEY ("prefix","year")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "owner_id" UUID NOT NULL,
    "start_at" TIMESTAMPTZ(3),
    "end_at" TIMESTAMPTZ(3),
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "deliverable" TEXT NOT NULL DEFAULT '',
    "status" "TaskStatus" NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
    "progress_percent" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "primary_assignee_id" UUID,
    "project_id" UUID,
    "parent_task_id" UUID,
    "assigned_at" TIMESTAMPTZ(3),
    "due_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "completion_due_at_snapshot" TIMESTAMPTZ(3),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "blocked_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_participants" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "ParticipantRole" NOT NULL,
    "invitation_status" "InvitationStatus" NOT NULL DEFAULT 'ACCEPTED',
    "invited_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(3),

    CONSTRAINT "task_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_comments" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(3),

    CONSTRAINT "task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_submissions" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "submitted_by_id" UUID NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "deliverable_url" TEXT,
    "notes" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'PENDING',
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMPTZ(3),
    "withdrawn_reason" TEXT,

    CONSTRAINT "task_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_approvals" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "submission_id" UUID NOT NULL,
    "decided_by_id" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "reason" TEXT,
    "due_at_snapshot" TIMESTAMPTZ(3),
    "decided_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_deadline_requests" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "proposed_due_at" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_deadline_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_assignee_requests" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "proposed_assignee_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ(3),
    "decision_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignee_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_events" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "business_event_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_events" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "reminder_type" TEXT NOT NULL,
    "milestone_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_objects" (
    "id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" TEXT,
    "etag" TEXT,
    "uploaded_by_id" UUID NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'UPLOADING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_links" (
    "id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "task_id" UUID,
    "submission_id" UUID,
    "comment_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMPTZ(3),

    CONSTRAINT "file_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_hash_key" ON "auth_sessions"("refresh_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_revoked_at_expires_at_idx" ON "auth_sessions"("user_id", "revoked_at", "expires_at");

-- CreateIndex
CREATE INDEX "projects_owner_id_status_idx" ON "projects"("owner_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_code_key" ON "tasks"("code");

-- CreateIndex
CREATE INDEX "tasks_type_status_due_at_idx" ON "tasks"("type", "status", "due_at");

-- CreateIndex
CREATE INDEX "tasks_primary_assignee_id_status_due_at_idx" ON "tasks"("primary_assignee_id", "status", "due_at");

-- CreateIndex
CREATE INDEX "tasks_project_id_status_idx" ON "tasks"("project_id", "status");

-- CreateIndex
CREATE INDEX "tasks_parent_task_id_idx" ON "tasks"("parent_task_id");

-- CreateIndex
CREATE INDEX "tasks_created_by_id_status_idx" ON "tasks"("created_by_id", "status");

-- CreateIndex
CREATE INDEX "task_participants_user_id_invitation_status_idx" ON "task_participants"("user_id", "invitation_status");

-- CreateIndex
CREATE UNIQUE INDEX "task_participants_task_id_user_id_role_key" ON "task_participants"("task_id", "user_id", "role");

-- CreateIndex
CREATE INDEX "task_comments_task_id_created_at_id_idx" ON "task_comments"("task_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "task_submissions_task_id_submitted_at_id_idx" ON "task_submissions"("task_id", "submitted_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "task_approvals_submission_id_key" ON "task_approvals"("submission_id");

-- CreateIndex
CREATE INDEX "task_approvals_task_id_decided_at_id_idx" ON "task_approvals"("task_id", "decided_at", "id");

-- CreateIndex
CREATE INDEX "task_deadline_requests_task_id_created_at_id_idx" ON "task_deadline_requests"("task_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "task_assignee_requests_task_id_created_at_id_idx" ON "task_assignee_requests"("task_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "task_events_task_id_created_at_id_idx" ON "task_events"("task_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_created_at_id_idx" ON "notifications"("recipient_id", "read_at", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_business_event_id_recipient_id_key" ON "notifications"("business_event_id", "recipient_id");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_events_task_id_recipient_id_reminder_type_mileston_key" ON "reminder_events"("task_id", "recipient_id", "reminder_type", "milestone_key");

-- CreateIndex
CREATE UNIQUE INDEX "file_objects_object_key_key" ON "file_objects"("object_key");

-- CreateIndex
CREATE INDEX "file_objects_uploaded_by_id_status_idx" ON "file_objects"("uploaded_by_id", "status");

-- CreateIndex
CREATE INDEX "file_links_task_id_idx" ON "file_links"("task_id");

-- CreateIndex
CREATE INDEX "file_links_submission_id_idx" ON "file_links"("submission_id");

-- CreateIndex
CREATE INDEX "file_links_comment_id_idx" ON "file_links"("comment_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_id_idx" ON "audit_logs"("created_at", "id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_primary_assignee_id_fkey" FOREIGN KEY ("primary_assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_fkey" FOREIGN KEY ("parent_task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_participants" ADD CONSTRAINT "task_participants_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_participants" ADD CONSTRAINT "task_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_approvals" ADD CONSTRAINT "task_approvals_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_approvals" ADD CONSTRAINT "task_approvals_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "task_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_approvals" ADD CONSTRAINT "task_approvals_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_deadline_requests" ADD CONSTRAINT "task_deadline_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_deadline_requests" ADD CONSTRAINT "task_deadline_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_deadline_requests" ADD CONSTRAINT "task_deadline_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignee_requests" ADD CONSTRAINT "task_assignee_requests_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignee_requests" ADD CONSTRAINT "task_assignee_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignee_requests" ADD CONSTRAINT "task_assignee_requests_proposed_assignee_id_fkey" FOREIGN KEY ("proposed_assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignee_requests" ADD CONSTRAINT "task_assignee_requests_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_events" ADD CONSTRAINT "reminder_events_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_links" ADD CONSTRAINT "file_links_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_links" ADD CONSTRAINT "file_links_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_links" ADD CONSTRAINT "file_links_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "task_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_links" ADD CONSTRAINT "file_links_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "task_comments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Constraints Prisma cannot express. Keep them in this migration when editing the schema.
CREATE UNIQUE INDEX "users_email_lower_unique" ON "users" (lower("email"));
ALTER TABLE "users" ADD CONSTRAINT "users_email_canonical_check" CHECK ("email" = lower(trim("email")));
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_singleton_check" CHECK ("id" = 1);
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_limits_check" CHECK ("default_due_hour" BETWEEN 0 AND 23 AND "reminder_before_hours" > 0 AND "max_file_size_mb" > 0);
ALTER TABLE "business_code_counters" ADD CONSTRAINT "business_code_counters_values_check" CHECK ("prefix" IN ('CV', 'NH', 'CN') AND "year" BETWEEN 2000 AND 9999 AND "next_value" > 0);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_progress_check" CHECK ("progress_percent" BETWEEN 0 AND 100 AND "version" > 0);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_blocked_reason_check" CHECK (NOT "is_blocked" OR length(trim(coalesce("blocked_reason", ''))) > 0);
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_official_published_check" CHECK ("type" <> 'OFFICIAL' OR "status" = 'DRAFT' OR ("primary_assignee_id" IS NOT NULL AND "due_at" IS NOT NULL));
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_done_check" CHECK ("status" <> 'DONE' OR "completed_at" IS NOT NULL);
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_body_check" CHECK (length(trim("body")) > 0);
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_summary_check" CHECK (length(trim("summary")) > 0);
CREATE UNIQUE INDEX "task_submissions_one_pending_per_task" ON "task_submissions" ("task_id") WHERE "status" = 'PENDING';
ALTER TABLE "task_approvals" ADD CONSTRAINT "task_approvals_return_reason_check" CHECK ("decision" <> 'RETURNED' OR length(trim(coalesce("reason", ''))) > 0);
ALTER TABLE "task_deadline_requests" ADD CONSTRAINT "task_deadline_requests_reason_check" CHECK (length(trim("reason")) > 0);
CREATE UNIQUE INDEX "task_deadline_requests_one_pending_per_task" ON "task_deadline_requests" ("task_id") WHERE "status" = 'PENDING';
ALTER TABLE "task_assignee_requests" ADD CONSTRAINT "task_assignee_requests_reason_check" CHECK (length(trim("reason")) > 0);
CREATE UNIQUE INDEX "task_assignee_requests_one_pending_per_task" ON "task_assignee_requests" ("task_id") WHERE "status" = 'PENDING';
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_size_check" CHECK ("size_bytes" >= 0);
ALTER TABLE "file_links" ADD CONSTRAINT "file_links_one_entity_check" CHECK (num_nonnulls("task_id", "submission_id", "comment_id") = 1);
CREATE UNIQUE INDEX "file_links_one_active_per_file" ON "file_links" ("file_id") WHERE "removed_at" IS NULL;
CREATE UNIQUE INDEX "file_links_task_unique" ON "file_links" ("file_id", "task_id") WHERE "task_id" IS NOT NULL;
CREATE UNIQUE INDEX "file_links_submission_unique" ON "file_links" ("file_id", "submission_id") WHERE "submission_id" IS NOT NULL;
CREATE UNIQUE INDEX "file_links_comment_unique" ON "file_links" ("file_id", "comment_id") WHERE "comment_id" IS NOT NULL;

-- Events and audit entries are historical facts: corrections must be new entries.
CREATE FUNCTION prevent_history_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'historical records are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER task_events_append_only BEFORE UPDATE OR DELETE ON "task_events" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
