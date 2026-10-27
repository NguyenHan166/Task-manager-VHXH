"""Generate the Phase 00 OpenAPI contract with only Python's standard library."""

from __future__ import annotations

import json
from pathlib import Path


def ref(name: str) -> dict:
    return {"$ref": f"#/components/schemas/{name}"}


def string(*, enum=None, fmt=None, nullable=False, pattern=None, example=None) -> dict:
    value = {"type": "string"}
    if enum is not None:
        value["enum"] = enum
    if fmt is not None:
        value["format"] = fmt
    if pattern is not None:
        value["pattern"] = pattern
    if nullable:
        value["nullable"] = True
    if example is not None:
        value["example"] = example
    return value


def integer(*, minimum=None, maximum=None, example=None) -> dict:
    value = {"type": "integer"}
    if minimum is not None:
        value["minimum"] = minimum
    if maximum is not None:
        value["maximum"] = maximum
    if example is not None:
        value["example"] = example
    return value


def array(items: dict) -> dict:
    return {"type": "array", "items": items}


def model(properties: dict, required=(), *, extra=False, description=None) -> dict:
    value = {"type": "object", "properties": properties, "additionalProperties": extra}
    if required:
        value["required"] = list(required)
    if description:
        value["description"] = description
    return value


def page(name: str) -> dict:
    return model(
        {"items": array(ref(name)), "total": integer(minimum=0), "page": integer(minimum=1), "pageSize": integer(minimum=1, maximum=100)},
        ("items", "total", "page", "pageSize"),
    )


UUID = string(fmt="uuid")
UTC = string(fmt="date-time", pattern=r"Z$")
DATE = string(fmt="date", pattern=r"^\d{4}-\d{2}-\d{2}$")
ROLE = string(enum=["MANAGER", "DEPUTY_MANAGER", "STAFF"])
STATUS = string(enum=["DRAFT", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"])
TYPE = string(enum=["OFFICIAL", "TEAM", "PERSONAL"])
PRIORITY = string(enum=["LOW", "NORMAL", "HIGH", "URGENT"])

schemas = {
    "Health": model({"status": string(enum=["ok", "degraded"]), "database": string(enum=["ok", "unavailable"])}, ("status", "database")),
    "ErrorEnvelope": model({"error": model({"code": string(enum=["VALIDATION", "UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "CONFLICT"]), "message": string(), "fieldErrors": {"type": "object", "additionalProperties": string()}}, ("code", "message"))}, ("error",)),
    "Success": model({"success": {"type": "boolean", "example": True}}, ("success",)),
    "User": model({"id": UUID, "username": string(), "email": string(fmt="email"), "displayName": string(), "role": ROLE, "status": string(enum=["ACTIVE", "LOCKED"]), "jobTitle": string(), "department": string(nullable=True), "phoneNumber": string(nullable=True), "avatarUrl": string(nullable=True), "createdAt": UTC, "lastLoginAt": {**UTC, "nullable": True}}, ("id", "username", "email", "displayName", "role", "status", "jobTitle", "createdAt")),
    "Task": model({"id": UUID, "code": string(pattern=r"^(CV|NH|CN)-\d{4}-\d{4,}$"), "type": TYPE, "title": string(), "description": string(), "deliverable": string(), "status": STATUS, "priority": PRIORITY, "progressPercent": integer(minimum=0, maximum=100), "createdById": UUID, "primaryAssigneeId": {**UUID, "nullable": True}, "projectId": {**UUID, "nullable": True}, "parentTaskId": {**UUID, "nullable": True}, "assignedAt": {**UTC, "nullable": True}, "dueAt": {**UTC, "nullable": True}, "completedAt": {**UTC, "nullable": True}, "approvedById": {**UUID, "nullable": True}, "approvedAt": {**UTC, "nullable": True}, "completionDueAtSnapshot": {**UTC, "nullable": True}, "isBlocked": {"type": "boolean"}, "blockedReason": string(nullable=True), "createdAt": UTC, "updatedAt": UTC, "version": integer(minimum=1)}, ("id", "code", "type", "title", "description", "deliverable", "status", "priority", "progressPercent", "createdById", "createdAt", "updatedAt", "version")),
    "TaskParticipant": model({"id": UUID, "taskId": UUID, "userId": UUID, "role": string(enum=["COLLABORATOR", "WATCHER"]), "invitationStatus": string(enum=["PENDING", "ACCEPTED", "DECLINED"]), "invitedAt": UTC, "respondedAt": {**UTC, "nullable": True}}, ("id", "taskId", "userId", "role", "invitationStatus", "invitedAt")),
    "TaskComment": model({"id": UUID, "taskId": UUID, "authorId": UUID, "body": string(), "createdAt": UTC, "editedAt": {**UTC, "nullable": True}}, ("id", "taskId", "authorId", "body", "createdAt")),
    "TaskSubmission": model({"id": UUID, "taskId": UUID, "submittedById": UUID, "summary": string(), "details": string(nullable=True), "deliverableUrl": string(nullable=True), "notes": string(nullable=True), "status": string(enum=["PENDING", "APPROVED", "RETURNED", "WITHDRAWN"]), "submittedAt": UTC, "withdrawnAt": {**UTC, "nullable": True}, "withdrawnReason": string(nullable=True), "fileIds": array(UUID)}, ("id", "taskId", "submittedById", "summary", "status", "submittedAt", "fileIds")),
    "TaskApproval": model({"id": UUID, "taskId": UUID, "submissionId": UUID, "decidedById": UUID, "decision": string(enum=["APPROVED", "RETURNED"]), "reason": string(nullable=True), "decidedAt": UTC, "dueAtSnapshot": {**UTC, "nullable": True}}, ("id", "taskId", "submissionId", "decidedById", "decision", "decidedAt")),
    "TaskEvent": model({"id": UUID, "taskId": UUID, "actorId": UUID, "kind": string(enum=["CREATED", "PUBLISHED", "STARTED", "PROGRESS_UPDATED", "COMPLETED", "SUBMITTED", "SUBMISSION_WITHDRAWN", "APPROVED", "RETURNED", "DEADLINE_REQUESTED", "DEADLINE_REQUEST_DECIDED", "DEADLINE_CHANGED", "ASSIGNEE_REQUESTED", "ASSIGNEE_REQUEST_DECIDED", "ASSIGNEE_CHANGED", "TYPE_CHANGED", "TEAM_INVITE_RESPONDED", "RECURRENCE_GENERATED", "BLOCKED", "UNBLOCKED", "CANCELLED", "REOPENED"]), "note": string(), "before": {"type": "object", "nullable": True, "additionalProperties": True}, "after": {"type": "object", "nullable": True, "additionalProperties": True}, "createdAt": UTC}, ("id", "taskId", "actorId", "kind", "note", "createdAt")),
    "TaskDeadlineRequest": model({"id": UUID, "taskId": UUID, "requestedById": UUID, "proposedDueAt": UTC, "reason": string(), "status": string(enum=["PENDING", "APPROVED", "REJECTED"]), "decidedById": {**UUID, "nullable": True}, "decidedAt": {**UTC, "nullable": True}, "decisionReason": string(nullable=True), "createdAt": UTC}, ("id", "taskId", "requestedById", "proposedDueAt", "reason", "status", "createdAt")),
    "TaskAssigneeRequest": model({"id": UUID, "taskId": UUID, "requestedById": UUID, "proposedAssigneeId": UUID, "reason": string(), "status": string(enum=["PENDING", "APPROVED", "REJECTED"]), "decidedById": {**UUID, "nullable": True}, "decidedAt": {**UTC, "nullable": True}, "decisionReason": string(nullable=True), "createdAt": UTC}, ("id", "taskId", "requestedById", "proposedAssigneeId", "reason", "status", "createdAt")),
    "FileObject": model({"id": UUID, "originalName": string(), "mimeType": string(), "sizeBytes": integer(minimum=0), "uploadedById": UUID, "status": string(enum=["UPLOADING", "READY", "REMOVED"]), "createdAt": UTC}, ("id", "originalName", "mimeType", "sizeBytes", "uploadedById", "status", "createdAt"), description="R2 objectKey is server-only and never included in public responses."),
    "Notification": model({"id": UUID, "recipientId": UUID, "type": string(enum=["TASK_ASSIGNED", "TASK_UPDATED", "TASK_DUE_SOON", "TASK_OVERDUE", "SUBMISSION_RECEIVED", "SUBMISSION_WITHDRAWN", "SUBMISSION_RETURNED", "SUBMISSION_APPROVED", "DEADLINE_REQUESTED", "ASSIGNEE_REQUESTED", "REQUEST_DECIDED", "COMMENT_ADDED", "TEAM_INVITED", "CHAT_MESSAGE"]), "title": string(), "body": string(), "entityType": string(enum=["TASK", "CHAT"]), "entityId": UUID, "createdAt": UTC, "readAt": {**UTC, "nullable": True}}, ("id", "recipientId", "type", "title", "body", "entityType", "entityId", "createdAt")),
    "AppSettings": model({"workspaceName": string(), "timezone": string(enum=["Asia/Ho_Chi_Minh"]), "defaultDueHour": integer(minimum=0, maximum=23), "reminderBeforeHours": integer(minimum=1), "maxFileSizeMb": integer(minimum=1)}, ("workspaceName", "timezone", "defaultDueHour", "reminderBeforeHours", "maxFileSizeMb")),
    "AuditLog": model({"id": UUID, "actorId": {**UUID, "nullable": True}, "kind": string(), "entityType": string(), "entityId": string(), "before": {"type": "object", "nullable": True, "additionalProperties": True}, "after": {"type": "object", "nullable": True, "additionalProperties": True}, "createdAt": UTC}, ("id", "kind", "entityType", "entityId", "createdAt")),
    "BackupStatus": model({"lastAttemptAt": {**UTC, "nullable": True}, "lastSuccessAt": {**UTC, "nullable": True}, "status": string(enum=["NEVER", "SUCCEEDED", "FAILED", "RUNNING"]), "retentionDays": integer(example=30), "lastRestoreDrillAt": {**UTC, "nullable": True}}, ("status", "retentionDays"), description="No object key, signed URL, DB dump or credentials."),
    "Project": model({"id": UUID, "name": string(), "description": string(), "ownerId": UUID, "startAt": {**UTC, "nullable": True}, "endAt": {**UTC, "nullable": True}, "status": string(enum=["ACTIVE", "ARCHIVED"]), "createdAt": UTC}, ("id", "name", "description", "ownerId", "status", "createdAt")),
    "RecurrenceRule": model({"id": UUID, "title": string(), "description": string(), "ownerId": UUID, "scope": string(enum=["ALL", "CUSTOM"]), "assigneeIds": array(UUID), "priority": PRIORITY, "frequency": string(enum=["WEEKLY", "MONTHLY"]), "dueAfterHours": integer(minimum=1), "nextRunAt": UTC, "active": {"type": "boolean"}, "createdAt": UTC}, ("id", "title", "ownerId", "scope", "assigneeIds", "frequency", "dueAfterHours", "nextRunAt", "active")),
    "RecurrenceInstance": model({"id": UUID, "ruleId": UUID, "periodKey": string(), "taskIds": array(UUID), "createdAt": UTC}, ("id", "ruleId", "periodKey", "taskIds", "createdAt")),
    "ChatRoom": model({"id": UUID, "kind": string(enum=["DIRECT", "GROUP"]), "title": string(nullable=True), "createdAt": UTC}, ("id", "kind", "createdAt")),
    "ChatMessage": model({"id": UUID, "roomId": UUID, "senderId": UUID, "body": string(), "createdAt": UTC, "editedAt": {**UTC, "nullable": True}, "deletedAt": {**UTC, "nullable": True}}, ("id", "roomId", "senderId", "body", "createdAt")),
    "AuthSession": model({"accessToken": string(), "expiresInSeconds": integer(example=900), "user": ref("User")}, ("accessToken", "expiresInSeconds", "user")),
    "ResetPasswordResult": model({"temporaryPassword": string(), "message": string()}, ("temporaryPassword", "message")),
    "UserWorkloadStats": model({"user": ref("User"), "primaryCount": integer(), "collabCount": integer(), "doneCount": integer(), "doneOnTimeCount": integer(), "onTimeRate": integer(minimum=0, maximum=100), "overdueCount": integer()}, ("user", "primaryCount", "collabCount", "doneCount", "doneOnTimeCount", "onTimeRate", "overdueCount")),
    "ManagerDashboardStats": model({key: integer(minimum=0) for key in ["totalActivePublished", "todoCount", "inProgressCount", "inReviewCount", "doneCount", "overdueCount", "completedOnTimeCount", "draftCount", "cancelledCount", "totalOfficialCount"]}, ["totalActivePublished", "todoCount", "inProgressCount", "inReviewCount", "doneCount", "overdueCount", "completedOnTimeCount", "draftCount", "cancelledCount", "totalOfficialCount"]),
    "StaffDashboardStats": model({key: integer(minimum=0) for key in ["totalAssigned", "todoCount", "inProgressCount", "inReviewCount", "doneCount", "overdueCount", "dueSoonCount", "collaboratingCount", "personalCount"]}, ["totalAssigned", "todoCount", "inProgressCount", "inReviewCount", "doneCount", "overdueCount", "dueSoonCount", "collaboratingCount", "personalCount"]),
    "KpiReport": model({"scope": string(enum=["DEPT", "STAFF"]), "summary": {"oneOf": [ref("ManagerDashboardStats"), ref("StaffDashboardStats")]}, "workloads": array(ref("UserWorkloadStats"))}, ("scope", "summary", "workloads")),
    "UnreadCount": model({"count": integer(minimum=0)}, ("count",)),
    "UploadTicket": model({"fileId": UUID, "uploadUrl": string(fmt="uri"), "expiresAt": UTC, "requiredHeaders": {"type": "object", "additionalProperties": string()}}, ("fileId", "uploadUrl", "expiresAt", "requiredHeaders")),
    "DownloadTicket": model({"downloadUrl": string(fmt="uri"), "originalName": string(), "expiresAt": UTC}, ("downloadUrl", "originalName", "expiresAt")),
    "SubmissionResult": model({"submission": ref("TaskSubmission"), "task": ref("Task")}, ("submission", "task")),
    "ApprovalResult": model({"approval": ref("TaskApproval"), "task": ref("Task")}, ("approval", "task")),
    "DeadlineDecisionResult": model({"request": ref("TaskDeadlineRequest"), "task": ref("Task")}, ("request", "task")),
    "AssigneeDecisionResult": model({"request": ref("TaskAssigneeRequest"), "task": ref("Task")}, ("request", "task")),
    "RecurrenceGenerateResult": model({"instance": ref("RecurrenceInstance"), "tasks": array(ref("Task"))}, ("instance", "tasks")),
    "CalendarItem": model({"taskId": UUID, "title": string(), "dueAt": UTC, "status": STATUS}, ("taskId", "title", "dueAt", "status")),
    "TaskDetail": model({"task": ref("Task"), "participants": array(ref("TaskParticipant")), "files": array(ref("FileObject")), "latestSubmission": {"allOf": [ref("TaskSubmission")], "nullable": True}, "historyCounts": model({"comments": integer(minimum=0), "submissions": integer(minimum=0), "approvals": integer(minimum=0), "events": integer(minimum=0)}, ("comments", "submissions", "approvals", "events"))}, ("task", "participants", "files", "historyCounts"), description="Histories are fetched through paginated subresource endpoints."),
}

for item in ("User", "Task", "TaskComment", "TaskSubmission", "TaskApproval", "TaskEvent", "TaskDeadlineRequest", "TaskAssigneeRequest", "FileObject", "Notification", "AuditLog", "Project", "RecurrenceRule", "RecurrenceInstance", "ChatRoom", "ChatMessage"):
    schemas[f"Page{item}"] = page(item)
schemas["ErrorEnvelope"]["example"] = {"error": {"code": "CONFLICT", "message": "Trạng thái nhiệm vụ đã thay đổi"}}

# Strict request DTOs. The server fills all actor/system fields.
schemas.update({
    "LoginInput": model({"email": string(fmt="email"), "password": string()}, ("email", "password")),
    "OwnProfileInput": model({"displayName": string(), "jobTitle": string(), "phoneNumber": string(nullable=True), "avatarUrl": string(nullable=True)}),
    "ChangePasswordInput": model({"currentPassword": string(), "newPassword": string()}, ("currentPassword", "newPassword")),
    "CreateUserInput": model({"displayName": string(), "email": string(fmt="email"), "role": ROLE, "jobTitle": string(), "department": string(), "phoneNumber": string(), "initialPassword": string()}, ("displayName", "email", "role", "jobTitle")),
    "UpdateUserInput": model({"displayName": string(), "email": string(fmt="email"), "role": ROLE, "status": string(enum=["ACTIVE", "LOCKED"]), "jobTitle": string(), "department": string(), "phoneNumber": string()}),
    "ResetPasswordInput": model({"newPassword": string()}),
    "CreateTaskInput": model({"type": TYPE, "title": string(), "description": string(), "deliverable": string(), "priority": PRIORITY, "primaryAssigneeId": {**UUID, "nullable": True}, "collaboratorIds": array(UUID), "watcherIds": array(UUID), "dueAt": {**UTC, "nullable": True}, "dueDate": DATE, "projectId": {**UUID, "nullable": True}, "parentTaskId": {**UUID, "nullable": True}}, ("type", "title"), description="P0 accepts OFFICIAL only. dueAt and dueDate are mutually exclusive; DRAFT may omit assignment/due date. projectId/parentTaskId open in P1."),
    "UpdateTaskInput": model({"title": string(), "description": string(), "deliverable": string(), "priority": PRIORITY, "projectId": {**UUID, "nullable": True}}, description="No status, dueAt, assignee or server fields. projectId opens in P1."),
    "ProgressInput": model({"progressPercent": integer(minimum=0, maximum=100), "isBlocked": {"type": "boolean"}, "blockedReason": string(nullable=True)}, ("progressPercent", "isBlocked")),
    "AdjustTaskInput": model({"reason": string(), "dueAt": UTC, "dueDate": DATE, "primaryAssigneeId": UUID, "priority": PRIORITY}, ("reason",), description="At least one mutable field; dueAt and dueDate are mutually exclusive."),
    "ReasonInput": model({"reason": string()}, ("reason",)),
    "SubmitTaskInput": model({"summary": string(), "details": string(nullable=True), "deliverableUrl": string(nullable=True), "notes": string(nullable=True), "fileIds": array(UUID)}, ("summary", "fileIds")),
    "WithdrawInput": model({"reason": string()}),
    "ApprovalInput": model({"submissionId": UUID, "reason": string()}, ("submissionId",)),
    "ReturnInput": model({"submissionId": UUID, "reason": string()}, ("submissionId", "reason")),
    "CommentInput": model({"body": string()}, ("body",)),
    "UploadUrlInput": model({"originalName": string(), "mimeType": string(), "sizeBytes": integer(minimum=1), "entityType": string(enum=["TASK", "COMMENT", "MESSAGE"]), "entityId": UUID}, ("originalName", "mimeType", "sizeBytes", "entityType", "entityId"), description="P0 upload before submission uses entityType TASK. MESSAGE opens in P1."),
    "CompleteFileInput": model({"fileId": UUID}, ("fileId",)),
    "SettingsInput": model({"workspaceName": string(), "defaultDueHour": integer(minimum=0, maximum=23), "reminderBeforeHours": integer(minimum=1), "maxFileSizeMb": integer(minimum=1)}),
    "InvitationDecision": model({"decision": string(enum=["ACCEPTED", "DECLINED"])}, ("decision",)),
    "ConvertTeamInput": model({"title": string(), "deliverable": string(), "primaryAssigneeId": UUID, "dueAt": UTC, "dueDate": DATE}, ("deliverable", "primaryAssigneeId")),
    "SubtaskInput": model({"title": string(), "primaryAssigneeId": UUID, "dueAt": UTC, "dueDate": DATE, "priority": PRIORITY}, ("title",)),
    "DeadlineRequestInput": model({"proposedDueAt": UTC, "reason": string()}, ("proposedDueAt", "reason")),
    "AssigneeRequestInput": model({"proposedAssigneeId": UUID, "reason": string()}, ("proposedAssigneeId", "reason")),
    "DecisionInput": model({"decision": string(enum=["APPROVED", "REJECTED"]), "reason": string()}, ("decision",)),
    "ProjectInput": model({"name": string(), "description": string(), "startAt": UTC, "endAt": UTC}, ("name",)),
    "UpdateProjectInput": model({"name": string(), "description": string(), "startAt": UTC, "endAt": UTC, "status": string(enum=["ACTIVE", "ARCHIVED"])}),
    "RecurrenceRuleInput": model({"title": string(), "description": string(), "scope": string(enum=["ALL", "CUSTOM"]), "assigneeIds": array(UUID), "priority": PRIORITY, "frequency": string(enum=["WEEKLY", "MONTHLY"]), "dueAfterHours": integer(minimum=1)}, ("title", "scope", "priority", "frequency", "dueAfterHours")),
    "UpdateRecurrenceRuleInput": model({"title": string(), "description": string(), "scope": string(enum=["ALL", "CUSTOM"]), "assigneeIds": array(UUID), "priority": PRIORITY, "frequency": string(enum=["WEEKLY", "MONTHLY"]), "dueAfterHours": integer(minimum=1)}),
    "ChatRoomInput": model({"kind": string(enum=["DIRECT", "GROUP"]), "title": string(), "memberIds": array(UUID)}, ("kind", "memberIds")),
    "ChatMessageInput": model({"body": string()}, ("body",)),
})

paths: dict[str, dict] = {}


def envelope(name: str) -> dict:
    return model({"data": ref(name)}, ("data",))


def response(name: str, *, status="200", example=None) -> dict:
    media = {"schema": envelope(name)}
    if example is not None:
        media["example"] = {"data": example}
    return {status: {"description": "Success", "content": {"application/json": media}}}


def body(name: str, *, example=None) -> dict:
    media = {"schema": ref(name)}
    if example is not None:
        media["example"] = example
    return {"required": True, "content": {"application/json": media}}


def query(name: str, schema=None, *, required=False, description=None) -> dict:
    value = {"name": name, "in": "query", "required": required, "schema": schema or string()}
    if description:
        value["description"] = description
    return value


def path_id(name="id") -> dict:
    return {"name": name, "in": "path", "required": True, "schema": UUID}


PAGE = [query("page", integer(minimum=1)), query("pageSize", integer(minimum=1, maximum=100))]
TASK_QUERY = PAGE + [query("scope", string(enum=["ALL", "OWNED", "COLLABORATING", "WATCHING"])), query("type", string(enum=["ALL", "OFFICIAL", "TEAM", "PERSONAL"])), query("status", string(enum=["ALL", "DRAFT", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"])), query("priority", string(enum=["ALL", "LOW", "NORMAL", "HIGH", "URGENT"])), query("projectId", UUID), query("primaryAssigneeId", UUID), query("search"), query("dueFrom", UTC), query("dueTo", UTC), query("isOverdue", {"type": "boolean"}), query("sortBy", string(enum=["DUE_AT", "UPDATED_AT", "PRIORITY", "CREATED_AT"])), query("sortDirection", string(enum=["ASC", "DESC"]))]
DATE_RANGE = [query("fromDate", UTC), query("toDate", UTC)]
REPORT_FILTERS = DATE_RANGE + [query("projectId", UUID), query("primaryAssigneeId", UUID), query("priority", PRIORITY), query("status", STATUS)]


def add(method: str, path: str, opid: str, tag: str, result: str, *, phase="P0", request=None, params=None, created=False, description=None, public=False, cookie=False, example=None, request_example=None, errors=(400, 401, 403, 404, 409)):
    operation = {"tags": [tag], "operationId": opid, "summary": opid, "x-release-phase": phase, "responses": response(result, status="201" if created else "200", example=example)}
    if description:
        operation["description"] = description
    if request:
        operation["requestBody"] = body(request, example=request_example)
    if params:
        operation["parameters"] = params
    if public:
        operation["security"] = []
    elif cookie:
        operation["security"] = [{"refreshCookie": []}]
    for status in errors:
        operation["responses"][str(status)] = {"description": {400: "Invalid input", 401: "Unauthenticated", 403: "Forbidden", 404: "Not found or unreadable", 409: "Conflict"}[status], "content": {"application/json": {"schema": ref("ErrorEnvelope")}}}
    paths.setdefault(path, {})[method.lower()] = operation


add("POST", "/auth/login", "login", "Auth", "AuthSession", request="LoginInput", public=True, errors=(400, 401, 403), request_example={"email": "user@example.invalid", "password": "example-password"}, example={"accessToken": "example-access-token", "expiresInSeconds": 900, "user": {"id": "00000000-0000-4000-8000-000000000001", "username": "user@example.invalid", "email": "user@example.invalid", "displayName": "Người dùng mẫu", "role": "STAFF", "status": "ACTIVE", "jobTitle": "Chuyên viên", "createdAt": "2026-10-27T09:00:00.000Z"}})
paths["/auth/login"]["post"]["responses"]["200"]["headers"] = {"Set-Cookie": {"description": "Rotating refresh cookie; HttpOnly, Secure, SameSite=Lax, Path=/api/auth, Max-Age=604800", "schema": string()}}
add("GET", "/health", "getHealth", "Operations", "Health", public=True, errors=(), description="Liveness/readiness projection without infrastructure details.")
add("POST", "/auth/refresh", "refreshSession", "Auth", "AuthSession", cookie=True, errors=(401, 403), description="Rotates 7-day HttpOnly Secure SameSite=Lax refresh cookie; returns a new 15-minute access token.")
paths["/auth/refresh"]["post"]["responses"]["200"]["headers"] = {"Set-Cookie": {"description": "New rotating refresh cookie", "schema": string()}}
add("POST", "/auth/logout", "logout", "Auth", "Success", cookie=True, errors=(401,))
paths["/auth/logout"]["post"]["responses"]["200"]["headers"] = {"Set-Cookie": {"description": "Clears refresh cookie", "schema": string()}}
add("POST", "/auth/logout-all", "logoutAll", "Auth", "Success", description="Revoke all refresh sessions for the current user.", errors=(401,))
paths["/auth/logout-all"]["post"]["responses"]["200"]["headers"] = {"Set-Cookie": {"description": "Clears current refresh cookie", "schema": string()}}
add("GET", "/auth/me", "getMe", "Auth", "User", errors=(401,))
add("PATCH", "/auth/me", "updateOwnProfile", "Auth", "User", request="OwnProfileInput", errors=(400, 401))
add("POST", "/auth/change-password", "changePassword", "Auth", "Success", request="ChangePasswordInput", errors=(400, 401))

add("GET", "/users", "listUsers", "Users", "PageUser", params=PAGE + [query("status", string(enum=["ACTIVE", "LOCKED"])), query("role", ROLE), query("search")], description="STAFF receives only ACTIVE directory projection; management fields are Manager-only.", errors=(400, 401, 403))
add("POST", "/users", "createUser", "Users", "User", request="CreateUserInput", created=True, description="MANAGER only.")
add("GET", "/users/{id}", "getUser", "Users", "User", params=[path_id()], errors=(400, 401, 403, 404))
add("PATCH", "/users/{id}", "updateUser", "Users", "User", params=[path_id()], request="UpdateUserInput", description="MANAGER only; protect last ACTIVE MANAGER and self-lock.")
add("POST", "/users/{id}/reset-password", "resetUserPassword", "Users", "ResetPasswordResult", params=[path_id()], request="ResetPasswordInput", description="MANAGER only; temporary password is returned once and must not be logged.")
add("GET", "/users/{id}/workload", "getUserWorkload", "Users", "UserWorkloadStats", params=[path_id()] + DATE_RANGE, description="Leaders can inspect all; STAFF only self.")

task_example = {"id": "00000000-0000-4000-8000-000000000101", "code": "CV-2026-0001", "type": "OFFICIAL", "title": "Báo cáo mẫu", "description": "", "deliverable": "Báo cáo", "status": "IN_PROGRESS", "priority": "HIGH", "progressPercent": 60, "createdById": "00000000-0000-4000-8000-000000000001", "primaryAssigneeId": "00000000-0000-4000-8000-000000000002", "projectId": None, "parentTaskId": None, "assignedAt": "2026-10-22T09:00:00.000Z", "dueAt": "2026-10-28T09:00:00.000Z", "completedAt": None, "approvedById": None, "approvedAt": None, "completionDueAtSnapshot": None, "isBlocked": False, "blockedReason": None, "createdAt": "2026-10-21T09:00:00.000Z", "updatedAt": "2026-10-26T09:00:00.000Z", "version": 3}
add("GET", "/tasks", "queryTasks", "Tasks", "PageTask", params=TASK_QUERY, example={"items": [task_example], "total": 1, "page": 1, "pageSize": 10}, description="ACL is applied before filtering and total counting.")
add("POST", "/tasks", "createTask", "Tasks", "Task", request="CreateTaskInput", created=True, request_example={"type": "OFFICIAL", "title": "Báo cáo mẫu", "description": "", "deliverable": "Báo cáo", "priority": "HIGH", "primaryAssigneeId": "00000000-0000-4000-8000-000000000002", "collaboratorIds": [], "watcherIds": [], "dueDate": "2026-10-28"}, description="P0 OFFICIAL only; TEAM/PERSONAL variants open in P1.")
add("GET", "/tasks/{id}", "getTaskDetail", "Tasks", "TaskDetail", params=[path_id()])
add("PATCH", "/tasks/{id}", "updateTaskMetadata", "Tasks", "Task", params=[path_id()], request="UpdateTaskInput", description="No status, due date or assignee change through PATCH.")
add("DELETE", "/tasks/{id}", "deletePersonalTask", "Tasks", "Success", params=[path_id()], phase="P1", description="Creator of PERSONAL only.")
add("POST", "/tasks/{id}/complete", "completeTeamOrPersonalTask", "P1 Tasks", "Task", params=[path_id()], phase="P1", description="TEAM/PERSONAL IN_PROGRESS to DONE by creator/current assignee; no approval record.")
for suffix, opid, request, desc in [
    ("publish", "publishTask", None, "DRAFT to TODO; task creator must be a leader."),
    ("start", "startTask", None, "TODO to IN_PROGRESS; leader or current assignee."),
    ("progress", "updateTaskProgress", "ProgressInput", "TODO/IN_PROGRESS only; 100 percent does not mark DONE."),
    ("adjust", "adjustTask", "AdjustTaskInput", "Leader-only direct due date, assignee or priority change with reason."),
    ("cancel", "cancelTask", "ReasonInput", "Reason required; no mutation of historical submissions."),
    ("reopen", "reopenTask", "ReasonInput", "D-09 transition and history retention."),
]:
    add("POST", f"/tasks/{{id}}/{suffix}", opid, "Tasks", "Task", params=[path_id()], request=request, description=desc)

add("GET", "/tasks/{id}/submissions", "listSubmissions", "Workflow", "PageTaskSubmission", params=[path_id()] + PAGE)
add("POST", "/tasks/{id}/submissions", "submitTask", "Workflow", "SubmissionResult", params=[path_id()], request="SubmitTaskInput", created=True, request_example={"summary": "Đã hoàn thành báo cáo", "fileIds": []}, example={"submission": {"id": "00000000-0000-4000-8000-000000000201", "taskId": task_example["id"], "submittedById": "00000000-0000-4000-8000-000000000002", "summary": "Đã hoàn thành báo cáo", "status": "PENDING", "submittedAt": "2026-10-27T09:00:00.000Z", "fileIds": []}, "task": {**task_example, "status": "IN_REVIEW", "progressPercent": 100}}, description="Current assignee in IN_PROGRESS only; each submit creates a new immutable submission.")
add("POST", "/tasks/{id}/submissions/{submissionId}/withdraw", "withdrawSubmission", "Workflow", "SubmissionResult", params=[path_id(), path_id("submissionId")], request="WithdrawInput", description="Only submitter of current PENDING submission.")
add("GET", "/tasks/{id}/approvals", "listApprovals", "Workflow", "PageTaskApproval", params=[path_id()] + PAGE)
add("POST", "/tasks/{id}/approve", "approveTask", "Workflow", "ApprovalResult", params=[path_id()], request="ApprovalInput", request_example={"submissionId": "00000000-0000-4000-8000-000000000201"}, example={"approval": {"id": "00000000-0000-4000-8000-000000000301", "taskId": task_example["id"], "submissionId": "00000000-0000-4000-8000-000000000201", "decidedById": "00000000-0000-4000-8000-000000000001", "decision": "APPROVED", "reason": None, "decidedAt": "2026-10-27T09:00:00.000Z", "dueAtSnapshot": task_example["dueAt"]}, "task": {**task_example, "status": "DONE", "completedAt": "2026-10-27T09:00:00.000Z", "approvedById": "00000000-0000-4000-8000-000000000001", "approvedAt": "2026-10-27T09:00:00.000Z", "completionDueAtSnapshot": task_example["dueAt"]}}, description="MANAGER/DEPUTY_MANAGER; submissionId must be current PENDING.")
add("POST", "/tasks/{id}/return", "returnTask", "Workflow", "ApprovalResult", params=[path_id()], request="ReturnInput", request_example={"submissionId": "00000000-0000-4000-8000-000000000201", "reason": "Bổ sung phụ lục"}, description="MANAGER/DEPUTY_MANAGER; nonblank reason required.")
add("GET", "/tasks/{id}/comments", "listComments", "Tasks", "PageTaskComment", params=[path_id()] + PAGE)
add("POST", "/tasks/{id}/comments", "addComment", "Tasks", "TaskComment", params=[path_id()], request="CommentInput", created=True)
add("GET", "/tasks/{id}/events", "listTaskEvents", "Tasks", "PageTaskEvent", params=[path_id()] + PAGE)

add("POST", "/files/upload-url", "getUploadUrl", "Files", "UploadTicket", request="UploadUrlInput", created=True, description="P0 only TASK pre-submission; checks write ACL, size/MIME and creates UPLOADING metadata. Never accepts objectKey.")
add("POST", "/files/complete", "completeFile", "Files", "FileObject", request="CompleteFileInput", description="HEAD/size/type/checksum verification before READY.")
add("GET", "/files", "listFiles", "Files", "PageFileObject", params=PAGE + [query("entityType", string(enum=["TASK", "SUBMISSION", "COMMENT", "MESSAGE"])), query("entityId", UUID), query("search")])
add("GET", "/files/{id}/download-url", "getDownloadUrl", "Files", "DownloadTicket", params=[path_id()], description="Rechecks entity ACL; REMOVED files return 404.")
add("DELETE", "/files/{id}", "removeFile", "Files", "Success", params=[path_id()], description="Soft REMOVED; object cleanup after 90 days if no valid links.")

add("GET", "/notifications", "listNotifications", "Notifications", "PageNotification", params=PAGE + [query("unreadOnly", {"type": "boolean"}), query("after", string(), description="Cursor createdAt/id for reconnect")], errors=(400, 401))
add("GET", "/notifications/unread-count", "getUnreadCount", "Notifications", "UnreadCount", errors=(401,))
add("POST", "/notifications/{id}/read", "readNotification", "Notifications", "Notification", params=[path_id()])
add("POST", "/notifications/read-all", "readAllNotifications", "Notifications", "Success", errors=(401,))

add("GET", "/dashboard/stats", "getDashboardStats", "Reports", "ManagerDashboardStats", params=[query("scope", string(enum=["DEPT", "STAFF"]), required=True)] + REPORT_FILTERS, description="DEPT returns ManagerDashboardStats to leaders; STAFF returns StaffDashboardStats for self. Every filter is applied before aggregation. See oneOf schema override below.")
paths["/dashboard/stats"]["get"]["responses"]["200"]["content"]["application/json"]["schema"] = model({"data": {"oneOf": [ref("ManagerDashboardStats"), ref("StaffDashboardStats")]}}, ("data",))
add("GET", "/reports/kpi", "getKpiReport", "Reports", "KpiReport", params=REPORT_FILTERS, description="Scope DEPT for leaders; STAFF receives own report only. Same filters/formulas as dashboard and export.")
add("GET", "/reports/tasks", "getReportTasks", "Reports", "PageTask", params=TASK_QUERY + DATE_RANGE)
add("GET", "/reports/tasks/export", "exportReportTasks", "Reports", "Success", params=TASK_QUERY + DATE_RANGE + [query("format", string(enum=["CSV", "XLSX"]), required=True)], description="Leader-only binary export; content is CSV or XLSX. Response envelope does not apply to binary.")
paths["/reports/tasks/export"]["get"]["responses"]["200"] = {"description": "Binary export", "headers": {"Content-Disposition": {"schema": string()}}, "content": {"text/csv": {"schema": {"type": "string", "format": "binary"}}, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {"schema": {"type": "string", "format": "binary"}}}}
add("GET", "/settings", "getSettings", "Operations", "AppSettings", errors=(401,))
add("PATCH", "/settings", "updateSettings", "Operations", "AppSettings", request="SettingsInput", description="MANAGER only.")
add("GET", "/audit-logs", "listAuditLogs", "Operations", "PageAuditLog", params=PAGE + DATE_RANGE + [query("kind"), query("actorId", UUID), query("entityType"), query("entityId")], description="MANAGER only; separate from task timeline.")
add("GET", "/backup", "getBackupStatus", "Operations", "BackupStatus", description="MANAGER only. Metadata of latest backup/restore drill; no raw dump or signed URL.", errors=(401, 403))

# P1 operations remain in the contract to reserve canonical names and DTOs.
add("POST", "/tasks/{id}/invitations/{participantId}/respond", "respondTeamInvitation", "P1 Tasks", "TaskParticipant", phase="P1", params=[path_id(), path_id("participantId")], request="InvitationDecision")
add("POST", "/tasks/{id}/convert-official", "convertTeamToOfficial", "P1 Tasks", "Task", phase="P1", params=[path_id()], request="ConvertTeamInput")
add("POST", "/tasks/{id}/subtasks", "createSubtask", "P1 Tasks", "Task", phase="P1", params=[path_id()], request="SubtaskInput", created=True)
add("GET", "/tasks/{id}/deadline-requests", "listDeadlineRequests", "P1 Requests", "PageTaskDeadlineRequest", phase="P1", params=[path_id()] + PAGE)
add("POST", "/tasks/{id}/deadline-requests", "createDeadlineRequest", "P1 Requests", "TaskDeadlineRequest", phase="P1", params=[path_id()], request="DeadlineRequestInput", created=True)
add("POST", "/tasks/{id}/deadline-requests/{requestId}/decision", "decideDeadlineRequest", "P1 Requests", "DeadlineDecisionResult", phase="P1", params=[path_id(), path_id("requestId")], request="DecisionInput")
add("GET", "/tasks/{id}/assignee-requests", "listAssigneeRequests", "P1 Requests", "PageTaskAssigneeRequest", phase="P1", params=[path_id()] + PAGE)
add("POST", "/tasks/{id}/assignee-requests", "createAssigneeRequest", "P1 Requests", "TaskAssigneeRequest", phase="P1", params=[path_id()], request="AssigneeRequestInput", created=True)
add("POST", "/tasks/{id}/assignee-requests/{requestId}/decision", "decideAssigneeRequest", "P1 Requests", "AssigneeDecisionResult", phase="P1", params=[path_id(), path_id("requestId")], request="DecisionInput")
add("GET", "/projects", "listProjects", "P1 Projects", "PageProject", phase="P1", params=PAGE)
add("POST", "/projects", "createProject", "P1 Projects", "Project", phase="P1", request="ProjectInput", created=True)
add("GET", "/projects/{id}", "getProject", "P1 Projects", "Project", phase="P1", params=[path_id()])
add("PATCH", "/projects/{id}", "updateProject", "P1 Projects", "Project", phase="P1", params=[path_id()], request="UpdateProjectInput")
add("DELETE", "/projects/{id}", "archiveProject", "P1 Projects", "Project", phase="P1", params=[path_id()], description="Soft archive; tasks retain project history and ACL.")
add("GET", "/calendar", "getCalendar", "P1 Projects", "CalendarItem", phase="P1", params=[query("fromDate", UTC, required=True), query("toDate", UTC, required=True)], description="Array envelope; filters task ACL before projection.")
paths["/calendar"]["get"]["responses"]["200"]["content"]["application/json"]["schema"] = model({"data": array(ref("CalendarItem"))}, ("data",))
add("GET", "/recurrence-rules", "listRecurrenceRules", "P1 Recurrence", "PageRecurrenceRule", phase="P1", params=PAGE)
add("POST", "/recurrence-rules", "createRecurrenceRule", "P1 Recurrence", "RecurrenceRule", phase="P1", request="RecurrenceRuleInput", created=True)
add("PATCH", "/recurrence-rules/{id}", "updateRecurrenceRule", "P1 Recurrence", "RecurrenceRule", phase="P1", params=[path_id()], request="UpdateRecurrenceRuleInput")
add("DELETE", "/recurrence-rules/{id}", "deleteRecurrenceRule", "P1 Recurrence", "Success", phase="P1", params=[path_id()])
add("POST", "/recurrence-rules/{id}/toggle", "toggleRecurrenceRule", "P1 Recurrence", "RecurrenceRule", phase="P1", params=[path_id()])
add("POST", "/recurrence-rules/{id}/generate", "generateRecurrenceNext", "P1 Recurrence", "RecurrenceGenerateResult", phase="P1", params=[path_id()])
add("GET", "/recurrence-instances", "listRecurrenceInstances", "P1 Recurrence", "PageRecurrenceInstance", phase="P1", params=PAGE + [query("ruleId", UUID)])
add("GET", "/chat/rooms", "listChatRooms", "P1 Chat", "PageChatRoom", phase="P1", params=PAGE)
add("POST", "/chat/rooms", "createChatRoom", "P1 Chat", "ChatRoom", phase="P1", request="ChatRoomInput", created=True)
add("GET", "/chat/rooms/{id}/messages", "listChatMessages", "P1 Chat", "PageChatMessage", phase="P1", params=[path_id(), query("beforeId", UUID), query("limit", integer(minimum=1, maximum=100))])
add("POST", "/chat/rooms/{id}/messages", "sendChatMessage", "P1 Chat", "ChatMessage", phase="P1", params=[path_id()], request="ChatMessageInput", created=True)
add("POST", "/chat/rooms/{id}/read", "markChatRoomRead", "P1 Chat", "Success", phase="P1", params=[path_id()])

spec = {
    "openapi": "3.0.3",
    "info": {"title": "Office Workspace Backend Contract", "version": "1.0.0", "description": "Phase 00 contract, approved D-01–D-11. P1 operations are reserved and gated until Phase 09."},
    "servers": [{"url": "/api", "description": "Same-origin API base; deployment host is environment-specific"}],
    "tags": [{"name": name} for name in ["Auth", "Users", "Tasks", "Workflow", "Files", "Notifications", "Reports", "Operations", "P1 Tasks", "P1 Requests", "P1 Projects", "P1 Recurrence", "P1 Chat"]],
    "security": [{"bearerAuth": []}],
    "paths": paths,
    "components": {"securitySchemes": {"bearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}, "refreshCookie": {"type": "apiKey", "in": "cookie", "name": "refreshToken"}}, "schemas": schemas},
    "x-socket-events": {"serverToClient": ["notification:new", "task:updated", "message:new", "message:updated"], "clientToServer": ["room:join", "room:leave"], "sourceOfTruth": "REST and durable DB records; rooms are server ACL checked"},
}

out = Path(__file__).with_name("openapi.v1.json")
out.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Wrote {out} with {sum(len(v) for v in paths.values())} operations and {len(schemas)} schemas")
