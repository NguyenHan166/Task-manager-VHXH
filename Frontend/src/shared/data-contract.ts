/** Canonical frontend/backend data contract for the UI prototype.
 * Copy to src/shared/data-contract.ts. ISO timestamps are UTC; render in Asia/Ho_Chi_Minh.
 */
export type Id = string;
export type IsoDateTime = string;

export type UserRole = "MANAGER" | "DEPUTY_MANAGER" | "STAFF";
export type UserStatus = "ACTIVE" | "LOCKED";
export type TaskType = "OFFICIAL" | "TEAM" | "PERSONAL";
export type TaskStatus = "DRAFT" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED";
export type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type ParticipantRole = "COLLABORATOR" | "WATCHER";
export type InvitationStatus = "PENDING" | "ACCEPTED" | "DECLINED";
export type ApprovalDecision = "APPROVED" | "RETURNED";
export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface User {
  id: Id;
  username: string; // Tên đăng nhập (Email công vụ)
  email: string; // Email công vụ (bắt buộc, dùng làm tên đăng nhập)
  displayName: string;
  /** Directory responses intentionally omit role/status for non-managers. */
  role?: UserRole;
  status?: UserStatus;
  jobTitle: string;
  phoneNumber?: string;
  department?: string;
  avatarUrl: string | null;
  createdAt: IsoDateTime;
  lastLoginAt?: IsoDateTime | null;
}

export interface Project {
  id: Id;
  name: string;
  description: string;
  ownerId: Id;
  startAt: IsoDateTime | null;
  endAt: IsoDateTime | null;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: IsoDateTime;
}

export interface Task {
  id: Id;
  code: string;
  type: TaskType;
  title: string;
  description: string;
  deliverable: string;
  status: TaskStatus;
  priority: TaskPriority;
  progressPercent: number; // integer 0..100
  createdById: Id;
  primaryAssigneeId: Id | null;
  projectId: Id | null;
  parentTaskId: Id | null;
  assignedAt: IsoDateTime | null;
  dueAt: IsoDateTime | null;
  completedAt: IsoDateTime | null;
  approvedById: Id | null;
  approvedAt: IsoDateTime | null;
  completionDueAtSnapshot?: IsoDateTime | null;
  version?: number;
  isBlocked: boolean;
  blockedReason: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  archivedAt: IsoDateTime | null;
}

export interface TaskParticipant {
  id: Id;
  taskId: Id;
  userId: Id;
  role: ParticipantRole;
  invitationStatus: InvitationStatus;
  invitedAt: IsoDateTime;
  respondedAt: IsoDateTime | null;
}

export interface TaskInvitationPreview {
  id: Id;
  role: ParticipantRole;
  invitedAt: IsoDateTime;
  task: {
    code: string;
    title: string;
    creator: { displayName: string };
  };
}

export interface TaskComment {
  id: Id;
  taskId: Id;
  authorId: Id;
  body: string;
  createdAt: IsoDateTime;
  editedAt: IsoDateTime | null;
}

export interface TaskSubmission {
  id: Id;
  taskId: Id;
  submittedById: Id;
  summary: string;
  details?: string | null;
  deliverableUrl?: string | null;
  notes?: string | null;
  fileIds?: Id[];
  submittedAt: IsoDateTime;
  status?: "PENDING" | "APPROVED" | "RETURNED" | "WITHDRAWN";
  withdrawnAt?: IsoDateTime | null;
  withdrawnReason?: string | null;
}

export interface TaskApproval {
  id: Id;
  taskId: Id;
  submissionId: Id;
  decidedById: Id;
  decision: ApprovalDecision;
  reason: string | null;
  decidedAt: IsoDateTime;
}

export interface TaskDeadlineRequest {
  id: Id;
  taskId: Id;
  requestedById: Id;
  proposedDueAt: IsoDateTime;
  reason: string;
  status: RequestStatus;
  decidedById: Id | null;
  decidedAt: IsoDateTime | null;
  decisionReason: string | null;
  createdAt: IsoDateTime;
}

export interface TaskAssigneeRequest {
  id: Id;
  taskId: Id;
  requestedById: Id;
  proposedAssigneeId: Id;
  reason: string;
  status: RequestStatus;
  decidedById: Id | null;
  decidedAt: IsoDateTime | null;
  decisionReason: string | null;
  createdAt: IsoDateTime;
}

export interface RecurrenceRule {
  id: Id;
  title: string;
  description: string;
  ownerId: Id;
  scope?: "ALL" | "CUSTOM"; // ALL: giao cả phòng, CUSTOM: nhiều người cụ thể
  assigneeIds?: Id[]; // danh sách người được giao
  primaryAssigneeId?: Id; // tương thích ngược
  priority: TaskPriority;
  frequency: "WEEKLY" | "MONTHLY";
  dueAfterHours: number; // dueAt = occurrence creation time + this offset
  nextRunAt: IsoDateTime;
  active: boolean;
  createdAt: IsoDateTime;
}

export interface RecurrenceInstance {
  id: Id;
  ruleId: Id;
  periodKey: string; // e.g. 2026-W44 or 2026-10; unique per rule
  taskId: Id;
  taskIds?: Id[];
  createdAt: IsoDateTime;
}

export interface TaskEvent {
  id: Id;
  taskId: Id;
  actorId: Id;
  kind: "CREATED" | "DETAILS_UPDATED" | "COMMENT_ADDED" | "PUBLISHED" | "STARTED" | "PROGRESS_UPDATED" | "COMPLETED" | "SUBMITTED" | "SUBMISSION_WITHDRAWN" | "APPROVED" | "RETURNED" | "DEADLINE_REQUESTED" | "DEADLINE_REQUEST_DECIDED" | "DEADLINE_CHANGED" | "ASSIGNEE_REQUESTED" | "ASSIGNEE_REQUEST_DECIDED" | "ASSIGNEE_CHANGED" | "TYPE_CHANGED" | "TEAM_INVITE_RESPONDED" | "RECURRENCE_GENERATED" | "BLOCKED" | "UNBLOCKED" | "CANCELLED" | "REOPENED";
  note: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: IsoDateTime;
}

export interface Notification {
  id: Id;
  recipientId: Id;
  type: "TASK_ASSIGNED" | "TASK_UPDATED" | "TASK_DUE_SOON" | "TASK_OVERDUE" | "SUBMISSION_RECEIVED" | "SUBMISSION_WITHDRAWN" | "SUBMISSION_RETURNED" | "SUBMISSION_APPROVED" | "DEADLINE_REQUESTED" | "ASSIGNEE_REQUESTED" | "REQUEST_DECIDED" | "COMMENT_ADDED" | "TEAM_INVITED" | "CHAT_MESSAGE";
  title: string;
  body: string;
  entityType: "TASK" | "CHAT";
  entityId: Id;
  createdAt: IsoDateTime;
  readAt: IsoDateTime | null;
}

export interface FileObject {
  id: Id;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  objectKey?: string | null; // local mock only; backend keeps its R2 key private
  uploadedById: Id;
  createdAt: IsoDateTime;
  status: "MOCK_LOCAL" | "UPLOADING" | "READY" | "REMOVED";
}

export interface FileLink {
  id: Id;
  fileId: Id;
  entityType: "TASK" | "SUBMISSION" | "COMMENT" | "MESSAGE";
  entityId: Id;
}

export interface ChatRoom {
  id: Id;
  kind: "DIRECT" | "GROUP";
  title: string | null;
  createdAt: IsoDateTime;
}

export interface ChatRoomMember {
  id: Id;
  roomId: Id;
  userId: Id;
  lastReadAt: IsoDateTime | null;
  joinedAt: IsoDateTime;
}

export interface ChatMessage {
  id: Id;
  roomId: Id;
  senderId: Id;
  body: string;
  createdAt: IsoDateTime;
  editedAt: IsoDateTime | null;
  deletedAt: IsoDateTime | null;
}

export interface AppSettings {
  workspaceName: string;
  timezone: "Asia/Ho_Chi_Minh";
  defaultDueHour: number; // 0..23
  reminderBeforeHours: number;
  maxFileSizeMb: number;
}

export interface MockDb {
  schemaVersion: 1;
  users: User[];
  projects: Project[];
  tasks: Task[];
  participants: TaskParticipant[];
  comments: TaskComment[];
  submissions: TaskSubmission[];
  approvals: TaskApproval[];
  deadlineRequests: TaskDeadlineRequest[];
  assigneeRequests: TaskAssigneeRequest[];
  recurrenceRules: RecurrenceRule[];
  recurrenceInstances: RecurrenceInstance[];
  events: TaskEvent[];
  notifications: Notification[];
  files: FileObject[];
  fileLinks: FileLink[];
  chatRooms: ChatRoom[];
  chatMembers: ChatRoomMember[];
  chatMessages: ChatMessage[];
  settings: AppSettings;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TaskQuery {
  scope?: "ALL" | "OWNED" | "COLLABORATING" | "WATCHING";
  type?: TaskType | "ALL";
  status?: TaskStatus | "ALL";
  priority?: TaskPriority | "ALL";
  projectId?: Id | "ALL";
  primaryAssigneeId?: Id | "ALL";
  search?: string;
  dueFrom?: IsoDateTime;
  dueTo?: IsoDateTime;
  isOverdue?: boolean;
  page: number;
  pageSize: number;
  sortBy?: "DUE_AT" | "UPDATED_AT" | "PRIORITY" | "CREATED_AT";
  sortDirection?: "ASC" | "DESC";
}

export interface AppError {
  code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED" | "NETWORK_ERROR" | "SERVER_ERROR" | "MOCK_FAILURE";
  message: string;
  fieldErrors?: Record<string, string>;
}

/** Client commands: system fields are omitted and must be decided by the server. */
export interface CreateTaskInput {
  type: TaskType;
  title: string;
  description: string;
  deliverable: string;
  priority: TaskPriority;
  primaryAssigneeId: Id | null;
  collaboratorIds: Id[];
  watcherIds: Id[];
  dueAt: IsoDateTime | null;
  projectId: Id | null;
  parentTaskId: Id | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  deliverable?: string;
  priority?: TaskPriority;
  projectId?: Id | null;
}

export interface ProgressInput {
  progressPercent: number;
  isBlocked: boolean;
  blockedReason: string | null;
}

export interface SubmitTaskInput {
  summary: string;
  details?: string | null;
  deliverableUrl?: string | null;
  notes?: string | null;
  fileIds: Id[];
}

export interface ReviewTaskInput {
  reason: string | null; // required for RETURNED; optional for APPROVED
}

export interface CreateDeadlineRequestInput {
  proposedDueAt: IsoDateTime;
  reason: string;
}

export interface CreateAssigneeRequestInput {
  proposedAssigneeId: Id;
  reason: string;
}

export interface DecisionInput {
  decision: "APPROVED" | "REJECTED";
  reason: string | null;
}

export type ApiResult<T> = { data: T } | { error: AppError };

/** Derived values are never stored as independent fields. */
export function isTaskOverdue(task: Task, now: Date = new Date()): boolean {
  return !!task.dueAt && new Date(task.dueAt).getTime() < now.getTime() && !["DRAFT", "DONE", "CANCELLED"].includes(task.status);
}

export function canSeeTask(task: Task, viewer: User, participants: TaskParticipant[]): boolean {
  if (task.status === "DRAFT" && task.createdById !== viewer.id) return false;
  if (task.type === "PERSONAL") return task.createdById === viewer.id;
  if (task.type === "OFFICIAL" && (viewer.role === "MANAGER" || viewer.role === "DEPUTY_MANAGER")) return true;
  if (task.createdById === viewer.id || task.primaryAssigneeId === viewer.id) return true;
  return participants.some(p => p.taskId === task.id && p.userId === viewer.id && p.invitationStatus === "ACCEPTED");
}
