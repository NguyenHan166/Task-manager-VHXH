import type {
  AppSettings,
  ApprovalDecision,
  AppError,
  Project,
  RecurrenceRule,
  RecurrenceInstance,
  ChatRoom,
  ChatRoomMember,
  ChatMessage,
  CreateTaskInput,
  FileLink,
  FileObject,
  Id,
  Notification,
  Page,
  ProgressInput,
  Task,
  TaskApproval,
  TaskComment,
  TaskDeadlineRequest,
  TaskAssigneeRequest,
  TaskInvitationPreview,
  TaskEvent,
  TaskParticipant,
  TaskQuery,
  TaskSubmission,
  UpdateTaskInput,
  User,
} from "./data-contract";
import { ApiError, apiClient, type AuthenticatedUser } from "./api-client";

type JsonRecord = Record<string, unknown>;

const unsupported = (feature: string): never => {
  throw new ApiError("VALIDATION", `${feature} chưa được triển khai trong phạm vi P0.`);
};

function queryString(values: Record<string, string | number | boolean | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "" || value === "ALL") continue;
    query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

function pageQuery<T>(value: unknown): Page<T> {
  const result = value as Page<T>;
  return {
    items: Array.isArray(result?.items) ? result.items : [],
    total: Number(result?.total ?? 0),
    page: Number(result?.page ?? 1),
    pageSize: Number(result?.pageSize ?? 10),
  };
}

function asUser(value: JsonRecord): User {
  return {
    id: String(value.id),
    username: String(value.username ?? value.email ?? ""),
    email: String(value.email ?? value.username ?? ""),
    displayName: String(value.displayName ?? ""),
    role: value.role as User["role"],
    status: (value.status as User["status"]) ?? "ACTIVE",
    jobTitle: String(value.jobTitle ?? ""),
    department: typeof value.department === "string" ? value.department : undefined,
    phoneNumber: typeof value.phoneNumber === "string" ? value.phoneNumber : undefined,
    avatarUrl: typeof value.avatarUrl === "string" ? value.avatarUrl : null,
    createdAt: String(value.createdAt ?? new Date(0).toISOString()),
    lastLoginAt: typeof value.lastLoginAt === "string" ? value.lastLoginAt : null,
  };
}

function asTask(value: JsonRecord): Task {
  return {
    id: String(value.id),
    code: String(value.code ?? ""),
    type: value.type as Task["type"],
    title: String(value.title ?? ""),
    description: String(value.description ?? ""),
    deliverable: String(value.deliverable ?? ""),
    status: value.status as Task["status"],
    priority: value.priority as Task["priority"],
    progressPercent: Number(value.progressPercent ?? 0),
    createdById: String(value.createdById ?? ""),
    primaryAssigneeId: typeof value.primaryAssigneeId === "string" ? value.primaryAssigneeId : null,
    projectId: typeof value.projectId === "string" ? value.projectId : null,
    parentTaskId: typeof value.parentTaskId === "string" ? value.parentTaskId : null,
    assignedAt: typeof value.assignedAt === "string" ? value.assignedAt : null,
    dueAt: typeof value.dueAt === "string" ? value.dueAt : null,
    completedAt: typeof value.completedAt === "string" ? value.completedAt : null,
    approvedById: typeof value.approvedById === "string" ? value.approvedById : null,
    approvedAt: typeof value.approvedAt === "string" ? value.approvedAt : null,
    completionDueAtSnapshot: typeof value.completionDueAtSnapshot === "string" ? value.completionDueAtSnapshot : null,
    version: typeof value.version === "number" ? value.version : undefined,
    isBlocked: Boolean(value.isBlocked),
    blockedReason: typeof value.blockedReason === "string" ? value.blockedReason : null,
    createdAt: String(value.createdAt ?? new Date(0).toISOString()),
    updatedAt: String(value.updatedAt ?? value.createdAt ?? new Date(0).toISOString()),
    archivedAt: typeof value.archivedAt === "string" ? value.archivedAt : null,
  };
}

function asFile(value: JsonRecord): FileObject {
  return {
    id: String(value.id),
    originalName: String(value.originalName ?? ""),
    mimeType: String(value.mimeType ?? "application/octet-stream"),
    sizeBytes: Number(value.sizeBytes ?? 0),
    uploadedById: String(value.uploadedById ?? ""),
    createdAt: String(value.createdAt ?? new Date(0).toISOString()),
    status: value.status as FileObject["status"],
  };
}

function fileEntityType(entityType: FileLink["entityType"]): "TASK" | "COMMENT" | "MESSAGE" {
  if (entityType === "TASK" || entityType === "COMMENT" || entityType === 'MESSAGE') return entityType;
  return unsupported("Đính kèm vào submission/comment/message");
}

export class HttpRepository {
  private listeners = new Set<() => void>();
  private submissionTaskIds = new Map<Id, Id>();
  private submissionFileIds = new Map<Id, Id[]>();
  private latestTaskDetails = new Map<Id, JsonRecord>();
  private taskDetailsInFlight = new Map<Id, Promise<JsonRecord>>();
  private identity: AuthenticatedUser | null = null;
  private dataGeneration = 0;
  private participantsCache: { userId: Id; expiresAt: number; items: TaskParticipant[] } | null = null;
  private participantsInFlight: { userId: Id; promise: Promise<TaskParticipant[]> } | null = null;

  setIdentity(user: AuthenticatedUser | null): void {
    if (this.identity?.id !== user?.id) {
      this.participantsCache = null;
      this.participantsInFlight = null;
      this.latestTaskDetails.clear();
      this.taskDetailsInFlight.clear();
    }
    this.identity = user;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyDataChanged(): void {
    this.dataGeneration += 1;
    this.participantsCache = null;
    this.latestTaskDetails.clear();
    this.listeners.forEach((listener) => listener());
  }

  private changed<T>(value: T): T {
    this.notifyDataChanged();
    return value;
  }

  async queryTasks(query: Partial<TaskQuery> = {}): Promise<Page<Task>> {
    const values = {
      scope: query.scope,
      type: query.type,
      status: query.status,
      priority: query.priority,
      projectId: query.projectId,
      primaryAssigneeId: query.primaryAssigneeId,
      search: query.search?.trim(),
      dueFrom: query.dueFrom,
      dueTo: query.dueTo,
      isOverdue: query.isOverdue,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 10,
    };
    const page = await apiClient.request<Page<JsonRecord>>(`/tasks${queryString(values)}`);
    return { ...pageQuery(page), items: page.items.map((item) => asTask(item)) };
  }

  async getAllTasks(): Promise<Task[]> {
    return this.allPages<Task>("/tasks", {}, asTask);
  }

  async queryAllTasks(query: Partial<TaskQuery> = {}): Promise<Task[]> {
    const first = await this.queryTasks({ ...query, page: 1, pageSize: 100 });
    const pages = Math.ceil(first.total / 100);
    if (pages <= 1) return first.items;
    const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => this.queryTasks({ ...query, page: index + 2, pageSize: 100 })));
    return [...first.items, ...rest.flatMap((page) => page.items)];
  }

  async queryReportTasks(query: Record<string, string | number | boolean | null | undefined> = {}): Promise<Task[]> {
    return this.allPages<Task>("/reports/tasks", { ...query, pageSize: 100 }, asTask);
  }

  async getReportKpi(query: Record<string, string | number | boolean | null | undefined> = {}): Promise<JsonRecord> {
    return apiClient.request<JsonRecord>(`/reports/kpi${queryString(query)}`);
  }

  async exportReport(query: Record<string, string | number | boolean | null | undefined>, format: "CSV" | "XLSX" = "CSV") {
    return apiClient.requestBlob(`/reports/tasks/export${queryString({ ...query, format })}`);
  }

  async getParticipantsForTasks(taskIds: Id[]): Promise<TaskParticipant[]> {
    if (taskIds.length === 0) return [];
    const taskIdSet = new Set(taskIds);
    const participants = await this.getParticipants();
    return participants.filter((participant) => taskIdSet.has(participant.taskId));
  }

  async getTasks(): Promise<Task[]> {
    return this.getAllTasks();
  }

  async getTaskDetail(id: Id): Promise<JsonRecord> {
    const inFlight = this.taskDetailsInFlight.get(id);
    if (inFlight) return inFlight;
    const request = apiClient
      .request<JsonRecord>(`/tasks/${encodeURIComponent(id)}`)
      .then((detail) => {
        this.latestTaskDetails.set(id, detail);
        return detail;
      })
      .finally(() => {
        this.taskDetailsInFlight.delete(id);
      });
    this.taskDetailsInFlight.set(id, request);
    return request;
  }

  async getTaskById(id: Id): Promise<Task | null> {
    const detail = await this.getTaskDetail(id);
    return detail.task ? asTask(detail.task as JsonRecord) : null;
  }

  async getUsers(): Promise<User[]> {
    const users = await this.allPages<JsonRecord>("/users", {}, (row) => row);
    return users.map(asUser);
  }

  async getUserById(id: Id): Promise<User | null> {
    const user = await apiClient.request<JsonRecord>(`/users/${encodeURIComponent(id)}`);
    return asUser(user);
  }

  async getParticipants(taskId?: Id): Promise<TaskParticipant[]> {
    if (taskId) {
      const detail = await this.getTaskDetail(taskId);
      return Array.isArray(detail.participants) ? detail.participants as TaskParticipant[] : [];
    }
    const userId = this.identity?.id;
    if (!userId) return [];
    if (this.participantsCache?.userId === userId && this.participantsCache.expiresAt > Date.now()) {
      return this.participantsCache.items;
    }
    if (this.participantsInFlight?.userId === userId) return this.participantsInFlight.promise;

    const generation = this.dataGeneration;
    let request: Promise<TaskParticipant[]>;
    request = apiClient
      .request<TaskParticipant[]>('/tasks/participants')
      .then((items) => {
        const participants = Array.isArray(items) ? items : [];
        if (this.identity?.id === userId && this.dataGeneration === generation) {
          this.participantsCache = {
            userId,
            expiresAt: Date.now() + 15_000,
            items: participants,
          };
        }
        return participants;
      })
      .finally(() => {
        if (this.participantsInFlight?.promise === request) this.participantsInFlight = null;
      });
    this.participantsInFlight = { userId, promise: request };
    return request;
  }

  async getPendingInvitations(): Promise<TaskInvitationPreview[]> {
    return apiClient.request<TaskInvitationPreview[]>('/tasks/invitations');
  }

  async getProjects(): Promise<Project[]> {
    return apiClient.request<Project[]>('/projects');
  }

  async getProjectById(id: Id): Promise<Project | null> {
    return apiClient.request<Project>(`/projects/${encodeURIComponent(id)}`).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    });
  }

  async createProject(input: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
    return this.changed(await apiClient.request<Project>('/projects', { method: 'POST', body: JSON.stringify(input) }));
  }

  async updateProject(id: Id, updates: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<Project> {
    return this.changed(await apiClient.request<Project>(`/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(updates) }));
  }

  async getEvents(taskId?: Id): Promise<TaskEvent[]> {
    if (!taskId) return [];
    return this.allPages<TaskEvent>(`/tasks/${encodeURIComponent(taskId)}/events`, {}, (event) => event as unknown as TaskEvent);
  }

  async getComments(taskId: Id): Promise<TaskComment[]> {
    return this.allPages<TaskComment>(`/tasks/${encodeURIComponent(taskId)}/comments`, {}, (comment) => comment as unknown as TaskComment);
  }

  async addComment(taskId: Id, body: string, _authorId: Id): Promise<TaskComment> {
    const result = await apiClient.request<TaskComment>(`/tasks/${encodeURIComponent(taskId)}/comments`, {
      method: "POST", body: JSON.stringify({ body }),
    });
    return this.changed(result);
  }

  async getSubmissions(taskId?: Id): Promise<TaskSubmission[]> {
    if (taskId) {
      const task = await this.getTaskById(taskId);
      if (!task || task.type !== 'OFFICIAL') return [];
    }
    const tasks = taskId ? [{ id: taskId }] : (await this.getAllTasks()).filter((task) => task.type === 'OFFICIAL');
    const batches = await this.withConcurrency(tasks, 8, async (task) => {
      const items = await this.allPages<TaskSubmission>(`/tasks/${encodeURIComponent(task.id)}/submissions`, {}, (submission) => submission as unknown as TaskSubmission);
      for (const item of items) {
        this.submissionTaskIds.set(item.id, task.id);
        this.submissionFileIds.set(item.id, item.fileIds ?? []);
      }
      return items;
    });
    return batches.flat().sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
  }

  async addSubmission(taskId: Id, input: { summary: string; details?: string | null; deliverableUrl?: string | null; notes?: string | null; fileIds?: Id[] }, _submittedById: Id): Promise<TaskSubmission> {
    const result = await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(taskId)}/submissions`, {
      method: "POST",
      body: JSON.stringify({ summary: input.summary, details: input.details ?? null, deliverableUrl: input.deliverableUrl ?? null, notes: input.notes ?? null, fileIds: input.fileIds ?? [] }),
    });
    const submission = (result.submission ?? result) as TaskSubmission;
    this.submissionTaskIds.set(submission.id, taskId);
    return this.changed(submission);
  }

  async getApprovals(taskId?: Id): Promise<TaskApproval[]> {
    if (taskId) {
      const task = await this.getTaskById(taskId);
      if (!task || task.type !== 'OFFICIAL') return [];
    }
    const tasks = taskId ? [{ id: taskId }] : (await this.getAllTasks()).filter((task) => task.type === 'OFFICIAL');
    const batches = await this.withConcurrency(tasks, 8, async (task) =>
      this.allPages<TaskApproval>(`/tasks/${encodeURIComponent(task.id)}/approvals`, {}, (approval) => approval as unknown as TaskApproval),
    );
    return batches.flat().sort((a, b) => Date.parse(b.decidedAt) - Date.parse(a.decidedAt));
  }

  async decideApproval(submissionId: Id, decision: ApprovalDecision, reason: string | null, _decidedById: Id): Promise<TaskApproval> {
    let taskId = this.submissionTaskIds.get(submissionId);
    if (!taskId) {
      const submissions = await this.getSubmissions();
      taskId = this.submissionTaskIds.get(submissionId) ?? submissions.find((item) => item.id === submissionId)?.taskId;
    }
    if (!taskId) throw new ApiError("NOT_FOUND", "Không tìm thấy công việc của kết quả cần duyệt.", undefined, 404);
    const endpoint = decision === "APPROVED" ? "approve" : "return";
    const result = await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(taskId)}/${endpoint}`, {
      method: "POST", body: JSON.stringify({ submissionId, ...(reason ? { reason } : {}) }),
    });
    return this.changed((result.approval ?? result) as TaskApproval);
  }

  async withdrawSubmission(taskId: Id, _actorId: Id, reason?: string | null): Promise<Task> {
    const submissions = await this.getSubmissions(taskId);
    const pending = submissions.find((item) => item.status === "PENDING");
    if (!pending) throw new ApiError("CONFLICT", "Không còn kết quả đang chờ để thu hồi.", undefined, 409);
    const result = await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(taskId)}/submissions/${encodeURIComponent(pending.id)}/withdraw`, {
      method: "POST", body: JSON.stringify(reason ? { reason } : {}),
    });
    return this.changed(asTask((result.task ?? result) as JsonRecord));
  }

  async getDeadlineRequests(taskId?: Id): Promise<TaskDeadlineRequest[]> {
    if (taskId) return apiClient.request<TaskDeadlineRequest[]>(`/tasks/${encodeURIComponent(taskId)}/deadline-requests`);
    const tasks = await this.getAllTasks();
    const results = await this.withConcurrency(tasks.filter((task) => task.type === 'OFFICIAL'), 8, (task) =>
      apiClient.request<TaskDeadlineRequest[]>(`/tasks/${encodeURIComponent(task.id)}/deadline-requests`),
    );
    return results.flat();
  }

  async getAssigneeRequests(taskId?: Id): Promise<TaskAssigneeRequest[]> {
    if (taskId) return apiClient.request(`/tasks/${encodeURIComponent(taskId)}/assignee-requests`);
    const tasks = await this.getAllTasks();
    const results = await this.withConcurrency(tasks.filter((task) => task.type === 'OFFICIAL'), 8, (task) =>
      apiClient.request<TaskAssigneeRequest[]>(`/tasks/${encodeURIComponent(task.id)}/assignee-requests`),
    );
    return results.flat();
  }

  async getDashboardStats(scope: "DEPT" | "STAFF"): Promise<JsonRecord> {
    return apiClient.request<JsonRecord>(`/dashboard/stats${queryString({ scope })}`);
  }

  async getKpiReport(query: Record<string, string | number | boolean | undefined> = {}): Promise<JsonRecord> {
    return apiClient.request<JsonRecord>(`/reports/kpi${queryString(query)}`);
  }

  async getReportTasks(query: Record<string, string | number | boolean | undefined> = {}): Promise<Page<Task>> {
    const page = await apiClient.request<Page<JsonRecord>>(`/reports/tasks${queryString(query)}`);
    return { ...pageQuery(page), items: page.items.map((item) => asTask(item)) };
  }

  async getAllReportTasks(query: Record<string, string | number | boolean | undefined> = {}): Promise<Task[]> {
    const first = await this.getReportTasks({ ...query, page: 1, pageSize: 100 });
    const pages = Math.ceil(first.total / 100);
    if (pages <= 1) return first.items;
    const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => this.getReportTasks({ ...query, page: index + 2, pageSize: 100 })));
    return [...first.items, ...rest.flatMap((page) => page.items)];
  }

  async exportReportTasks(query: Record<string, string | number | boolean | undefined> = {}): Promise<{ blob: Blob; filename: string | null }> {
    return apiClient.requestBlob(`/reports/tasks/export${queryString(query)}`);
  }

  async getWorkload(userId: Id, query: Record<string, string | undefined> = {}): Promise<JsonRecord> {
    return apiClient.request<JsonRecord>(`/users/${encodeURIComponent(userId)}/workload${queryString(query)}`);
  }

  async createTask(input: CreateTaskInput & { isDraft?: boolean }, _actorId: Id): Promise<Task> {
    const result = await apiClient.request<JsonRecord>("/tasks", {
      method: "POST",
      body: JSON.stringify({
        type: input.type,
        title: input.title,
        description: input.description,
        deliverable: input.deliverable,
        priority: input.priority,
        ...(input.type === 'PERSONAL' ? {} : { primaryAssigneeId: input.primaryAssigneeId }),
        collaboratorIds: input.collaboratorIds,
        watcherIds: input.watcherIds,
        ...(input.dueAt ? { dueAt: input.dueAt } : {}),
      }),
    });
    const draft = asTask(result);
    if (input.type !== 'OFFICIAL') return this.changed(draft);
    if (input.isDraft) return this.changed(draft);

    const published = await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(draft.id)}/publish`, {
      method: "POST",
    });
    return this.changed(asTask(published));
  }

  async createAssignment(
    input: {
      title: string;
      description?: string;
      deliverable?: string;
      priority: Task['priority'];
      assigneeIds: Id[];
      dueAt: string;
      projectId?: Id | null;
    },
  ): Promise<Task> {
    const result = await apiClient.request<JsonRecord>('/tasks/assign', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return this.changed(asTask(result));
  }

  async updateTask(id: Id, input: UpdateTaskInput, _actorId: Id): Promise<Task> {
    const payload = { ...input } as Record<string, unknown>;
    delete payload.projectId;
    const result = await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
    return this.changed(asTask(result));
  }

  async publishTask(taskId: Id, _actorId: Id): Promise<Task> {
    const path = `/tasks/${encodeURIComponent(taskId)}/publish`;
    try {
      const result = await apiClient.request<JsonRecord>(path, { method: "POST" });
      return this.changed(asTask(result));
    } catch (firstError) {
      if (!this.mayHaveCommitted(firstError)) throw firstError;

      const persisted = await this.readTaskAfterPublishFailure(taskId);
      if (persisted?.status && persisted.status !== "DRAFT") return this.changed(persisted);

      try {
        const result = await apiClient.request<JsonRecord>(path, { method: "POST" });
        return this.changed(asTask(result));
      } catch (retryError) {
        const finalState = await this.readTaskAfterPublishFailure(taskId);
        if (finalState?.status && finalState.status !== "DRAFT") return this.changed(finalState);
        throw retryError;
      }
    }
  }

  private mayHaveCommitted(error: unknown): boolean {
    return error instanceof ApiError &&
      (error.code === "NETWORK_ERROR" || (error.status ?? 0) >= 500);
  }

  private async readTaskAfterPublishFailure(taskId: Id): Promise<Task | null> {
    try {
      const detail = await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(taskId)}`);
      return detail.task ? asTask(detail.task as JsonRecord) : null;
    } catch {
      return null;
    }
  }

  async startTask(taskId: Id, _actorId: Id): Promise<Task> {
    const result = await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(taskId)}/start`, { method: "POST" });
    return this.changed(asTask(result));
  }

  async updateTaskProgress(taskId: Id, input: ProgressInput, _actorId: Id): Promise<Task> {
    const result = await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(taskId)}/progress`, { method: "POST", body: JSON.stringify(input) });
    return this.changed(asTask(result));
  }

  async changeTaskStatus(taskId: Id, nextStatus: Task["status"], actorId: Id, _note?: string): Promise<Task> {
    if (nextStatus === "IN_PROGRESS") return this.startTask(taskId, actorId);
    if (nextStatus === "CANCELLED") {
      const task = await this.getTaskById(taskId);
      if (!task) throw new ApiError("NOT_FOUND", "Không tìm thấy công việc.", undefined, 404);
      await this.cancelTask(taskId, actorId);
      // Preserve the legacy method's return type; the task itself is deleted by the API.
      return { ...task, status: "CANCELLED" };
    }
    if (nextStatus === "DONE") {
      const task = await this.getTaskById(taskId);
      if (task?.type !== 'OFFICIAL') {
        const result = await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(taskId)}/complete`, { method: 'POST' });
        return this.changed(asTask(result));
      }
    }
    if (nextStatus === "DONE") return unsupported("Hoàn tất trực tiếp công việc OFFICIAL; cần nộp kết quả để duyệt");
    if (nextStatus === "IN_REVIEW") return unsupported("Chuyển sang chờ duyệt; hãy nộp kết quả");
    const task = await this.getTaskById(taskId);
    if (!task) throw new ApiError("NOT_FOUND", "Không tìm thấy công việc.", undefined, 404);
    return this.updateTaskProgress(taskId, { progressPercent: nextStatus === "TODO" ? 0 : task.progressPercent, isBlocked: task.isBlocked, blockedReason: task.blockedReason }, actorId);
  }

  async managerUpdateTaskDetails(taskId: Id, updates: { dueAt?: string | null; primaryAssigneeId?: Id | null; priority?: Task["priority"] }, reason: string, _actorId: Id): Promise<Task> {
    const result = await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(taskId)}/adjust`, {
      method: "POST", body: JSON.stringify({ ...updates, reason }),
    });
    return this.changed(asTask(result));
  }

  async cancelTask(taskId: Id, _actorId: Id): Promise<void> {
    await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(taskId)}/cancel`, { method: "POST", body: JSON.stringify({}) });
    this.changed(undefined);
  }

  async recallTask(taskId: Id, _actorId: Id): Promise<Task> {
    const result = await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(taskId)}/recall`, { method: "POST" });
    return this.changed(asTask(result));
  }

  async finishTask(taskId: Id, _actorId: Id): Promise<void> {
    await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(taskId)}/finish`, { method: "POST" });
    this.changed(undefined);
  }

  async reopenTask(taskId: Id, reason: string, _actorId: Id): Promise<Task> {
    const result = await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(taskId)}/reopen`, { method: "POST", body: JSON.stringify({ reason }) });
    return this.changed(asTask(result));
  }

  async getNotifications(_recipientId?: Id): Promise<Notification[]> {
    const response = await apiClient.request<JsonRecord>("/notifications?limit=100");
    const items = Array.isArray(response.items) ? response.items as JsonRecord[] : [];
    return items.map((item) => ({
      id: String(item.id),
      recipientId: this.identity?.id ?? "",
      type: item.type as Notification["type"],
      title: String(item.title ?? ""),
      body: String(item.body ?? ""),
      entityType: item.type === 'CHAT_MESSAGE' ? 'CHAT' : 'TASK',
      entityId: String(item.chatRoomId ?? item.taskId ?? (item.task as JsonRecord | undefined)?.id ?? ""),
      createdAt: String(item.createdAt ?? new Date(0).toISOString()),
      readAt: typeof item.readAt === "string" ? item.readAt : null,
    }));
  }

  async getUnreadNotificationCount(): Promise<number> {
    const response = await apiClient.request<{ count: number }>("/notifications/unread-count");
    return Number(response.count ?? 0);
  }

  async markNotificationAsRead(id: Id): Promise<Notification> {
    const result = await apiClient.request<JsonRecord>(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
    return this.changed({
      id: String(result.id), recipientId: this.identity?.id ?? "", type: "TASK_UPDATED",
      title: "", body: "", entityType: "TASK", entityId: "", createdAt: new Date(0).toISOString(),
      readAt: typeof result.readAt === "string" ? result.readAt : null,
    });
  }

  async markAllNotificationsAsRead(_recipientId?: Id): Promise<void> {
    await apiClient.request("/notifications/read-all", { method: "POST" });
    this.notifyDataChanged();
  }

  async getFiles(): Promise<FileObject[]> {
    return this.allPages<JsonRecord>("/files", {}, (item) => item).then((items) => items.map(asFile));
  }

  async getFileLinks(entityType?: FileLink["entityType"], entityId?: Id): Promise<FileLink[]> {
    if (entityType && entityId) {
      if (entityType === "SUBMISSION") {
        let fileIds = this.submissionFileIds.get(entityId);
        if (!fileIds) {
          const submissions = await this.getSubmissions();
          fileIds = this.submissionFileIds.get(entityId) ?? submissions.find((item) => item.id === entityId)?.fileIds ?? [];
        }
        return fileIds.map((fileId) => ({ id: `api:SUBMISSION:${entityId}:${fileId}`, fileId, entityType: "SUBMISSION" as const, entityId }));
      }
      const targetType = fileEntityType(entityType);
      const page = await apiClient.request<Page<JsonRecord>>(`/files${queryString({ entityType: targetType, entityId, page: 1, pageSize: 100 })}`);
      return pageQuery<JsonRecord>(page).items.map((file) => {
        const fileId = String(file.id);
        return { id: `api:${targetType}:${entityId}:${fileId}`, fileId, entityType: targetType, entityId };
      });
    }
    const tasks = await this.getAllTasks();
    const details = await this.withConcurrency(tasks, 8, async (task) => {
      const [taskLinks, submissions, comments] = await Promise.all([
        this.getFileLinks("TASK", task.id),
        this.getSubmissions(task.id),
        this.getComments(task.id),
      ]);
      const commentLinks = await this.withConcurrency(comments, 8, (comment) => this.getFileLinks("COMMENT", comment.id));
      return { taskLinks, submissions, commentLinks: commentLinks.flat() };
    });
    const links: FileLink[] = details.flatMap(({ taskLinks, submissions, commentLinks }) => {
      const submissionLinks: FileLink[] = [];
      for (const submission of submissions) {
        for (const fileId of submission.fileIds ?? []) {
          submissionLinks.push({ id: `api:SUBMISSION:${submission.id}:${fileId}`, fileId, entityType: "SUBMISSION", entityId: submission.id });
        }
      }
      return [...taskLinks, ...submissionLinks, ...commentLinks];
    });
    return links;
  }

  async uploadFile(file: File, entityType: "TASK" | "COMMENT" | "MESSAGE", entityId: Id): Promise<FileObject> {
    const ticket = await apiClient.request<JsonRecord>("/files/upload-url", {
      method: "POST", body: JSON.stringify({ originalName: file.name, mimeType: file.type, sizeBytes: file.size, entityType, entityId }),
    });
    try {
      const headers = new Headers(ticket.requiredHeaders as HeadersInit | undefined);
      const upload = await fetch(String(ticket.uploadUrl), { method: "PUT", headers, body: file });
      if (!upload.ok) throw new ApiError("NETWORK_ERROR", `Tải tệp lên kho lưu trữ thất bại (HTTP ${upload.status}).`, undefined, upload.status);
      const result = await apiClient.request<JsonRecord>("/files/complete", {
        method: "POST", body: JSON.stringify({ fileId: ticket.fileId }),
      });
      return this.changed(asFile(result));
    } catch (error) {
      try { await apiClient.request(`/files/${encodeURIComponent(String(ticket.fileId))}`, { method: "DELETE" }); } catch { /* Keep the original upload failure. */ }
      throw error;
    }
  }

  async getDownloadUrl(fileId: Id): Promise<string> {
    const ticket = await apiClient.request<JsonRecord>(`/files/${encodeURIComponent(fileId)}/download-url`);
    return String(ticket.downloadUrl);
  }

  async getPreviewUrl(fileId: Id): Promise<string> {
    const ticket = await apiClient.request<JsonRecord>(`/files/${encodeURIComponent(fileId)}/preview-url`);
    return String(ticket.previewUrl);
  }

  async deleteFile(fileId: Id, _actorId: Id): Promise<void> {
    await apiClient.request(`/files/${encodeURIComponent(fileId)}`, { method: "DELETE" });
    this.notifyDataChanged();
  }

  async createFileLink(fileId: Id, entityType: FileLink["entityType"], entityId: Id): Promise<FileLink> {
    if (entityType !== "TASK" && entityType !== "COMMENT" && entityType !== 'MESSAGE') return unsupported("Liên kết tệp này");
    // The API creates the entity link with the signed upload ticket.
    return { id: `api:${entityType}:${entityId}:${fileId}`, fileId, entityType, entityId };
  }

  async getSettings(): Promise<AppSettings> {
    return apiClient.request<AppSettings>("/settings");
  }

  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    const result = await apiClient.request<AppSettings>("/settings", { method: "PATCH", body: JSON.stringify(partial) });
    return this.changed(result);
  }

  async getAuditLogs(query: Record<string, string | number | undefined> = {}): Promise<JsonRecord[]> {
    const page = await apiClient.request<Page<JsonRecord>>(`/audit-logs${queryString(query)}`);
    return page.items;
  }

  async getBackupStatus(): Promise<JsonRecord> {
    return apiClient.request<JsonRecord>("/backup");
  }

  async getOperationsMetrics(): Promise<JsonRecord> {
    return apiClient.request<JsonRecord>("/operations/metrics");
  }

  async updateOwnProfile(input: { displayName?: string; jobTitle?: string; phoneNumber?: string | null; avatarUrl?: string | null }): Promise<AuthenticatedUser> {
    const result = await apiClient.request<AuthenticatedUser>("/auth/me", { method: "PATCH", body: JSON.stringify(input) });
    return this.changed(result);
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await apiClient.request("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
    this.notifyDataChanged();
  }

  async createUser(input: { email: string; displayName: string; jobTitle?: string; role?: User["role"]; phoneNumber?: string; department?: string; initialPassword?: string }, _actorId: Id): Promise<User & { temporaryPassword?: string }> {
    const result = await apiClient.request<JsonRecord>("/users", { method: "POST", body: JSON.stringify(input) });
    this.notifyDataChanged();
    return { ...asUser(result.user as JsonRecord), temporaryPassword: typeof result.temporaryPassword === "string" ? result.temporaryPassword : undefined };
  }

  async updateUser(id: Id, input: Partial<User>, _actorId: Id): Promise<User> {
    const result = await apiClient.request<JsonRecord>(`/users/${encodeURIComponent(id)}`, {
      method: "PATCH", body: JSON.stringify({
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle } : {}),
        ...(input.department !== undefined ? { department: input.department } : {}),
        ...(input.phoneNumber !== undefined ? { phoneNumber: input.phoneNumber } : {}),
      }),
    });
    return this.changed(asUser(result));
  }

  async resetPassword(id: Id, newPassword: string | undefined, _actorId: Id): Promise<{ temporaryPassword: string; message: string }> {
    const result = await apiClient.request<{ temporaryPassword: string; message: string }>(`/users/${encodeURIComponent(id)}/reset-password`, {
      method: "POST", body: JSON.stringify(newPassword ? { newPassword } : {}),
    });
    return this.changed(result);
  }

  async createDeadlineRequest(taskId: Id, input: { proposedDueAt: string; reason: string }, _actorId: Id): Promise<TaskDeadlineRequest> {
    return this.changed(await apiClient.request<TaskDeadlineRequest>(`/tasks/${encodeURIComponent(taskId)}/deadline-requests`, { method: 'POST', body: JSON.stringify(input) }));
  }

  async decideDeadlineRequest(requestId: Id, input: { decision: 'APPROVED' | 'REJECTED'; reason?: string | null }, _actorId: Id): Promise<TaskDeadlineRequest> {
    const request = (await this.getDeadlineRequests()).find((item) => item.id === requestId);
    if (!request) throw new ApiError('NOT_FOUND', 'Không tìm thấy đề nghị gia hạn.', undefined, 404);
    return this.changed(await apiClient.request<TaskDeadlineRequest>(`/tasks/${encodeURIComponent(request.taskId)}/deadline-requests/${encodeURIComponent(requestId)}/decision`, { method: 'POST', body: JSON.stringify(input) }));
  }

  async createAssigneeRequest(taskId: Id, input: { proposedAssigneeId: Id; reason: string }, _actorId: Id): Promise<TaskAssigneeRequest> {
    return this.changed(await apiClient.request<TaskAssigneeRequest>(`/tasks/${encodeURIComponent(taskId)}/assignee-requests`, { method: 'POST', body: JSON.stringify(input) }));
  }

  async transferTask(taskId: Id, input: { assigneeId: Id; note?: string }, _actorId: Id): Promise<Task> {
    const result = await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(taskId)}/transfer`, { method: 'POST', body: JSON.stringify(input) });
    return this.changed(asTask(result));
  }

  async decideAssigneeRequest(requestId: Id, input: { decision: 'APPROVED' | 'REJECTED'; reason?: string | null }, _actorId: Id): Promise<TaskAssigneeRequest> {
    const request = (await this.getAssigneeRequests()).find((item) => item.id === requestId);
    if (!request) throw new ApiError('NOT_FOUND', 'Không tìm thấy đề nghị đổi chủ trì.', undefined, 404);
    return this.changed(await apiClient.request<TaskAssigneeRequest>(`/tasks/${encodeURIComponent(request.taskId)}/assignee-requests/${encodeURIComponent(requestId)}/decision`, { method: 'POST', body: JSON.stringify(input) }));
  }

  async respondInvitation(participantId: Id, status: 'ACCEPTED' | 'DECLINED', _actorId: Id) {
    const result = await apiClient.request<JsonRecord>(`/tasks/invitations/${encodeURIComponent(participantId)}/respond`, { method: 'POST', body: JSON.stringify({ status }) });
    return this.changed(result);
  }

  async convertTeamToOfficial(taskId: Id, input: { primaryAssigneeId: Id; dueAt: string; priority?: Task['priority'] }, _actorId: Id): Promise<Task> {
    const result = await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(taskId)}/convert-official`, { method: 'POST', body: JSON.stringify(input) });
    return this.changed(asTask(result));
  }

  async createSubtask(parentId: Id, input: { title: string; primaryAssigneeId: Id; dueAt: string | null; priority?: Task['priority']; deliverable?: string }, _actorId: Id): Promise<Task> {
    const result = await apiClient.request<JsonRecord>(`/tasks/${encodeURIComponent(parentId)}/subtasks`, { method: 'POST', body: JSON.stringify(input) });
    return this.changed(asTask(result));
  }

  async deletePersonalTask(taskId: Id, _actorId: Id): Promise<void> {
    await apiClient.request(`/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' });
    this.notifyDataChanged();
  }

  async getRecurrenceRules(): Promise<RecurrenceRule[]> {
    const rows = await apiClient.request<JsonRecord[]>('/recurrence-rules');
    return rows.map((row) => ({ ...row, assigneeIds: Array.isArray(row.assigneeIds) ? row.assigneeIds.map(String) : [] }) as unknown as RecurrenceRule);
  }

  async getRecurrenceInstances(): Promise<RecurrenceInstance[]> {
    return apiClient.request<RecurrenceInstance[]>('/recurrence-instances');
  }

  async createRecurrenceRule(input: Omit<RecurrenceRule, 'id' | 'createdAt'>): Promise<RecurrenceRule> {
    const { ownerId: _ownerId, active: _active, primaryAssigneeId: _primary, assigneeIds = [], ...rest } = input;
    const result = await apiClient.request<JsonRecord>('/recurrence-rules', { method: 'POST', body: JSON.stringify({ ...rest, ...(input.scope === 'CUSTOM' ? { assigneeIds } : {}) }) });
    return this.changed({ ...result, assigneeIds: Array.isArray(result.assigneeIds) ? result.assigneeIds : [] } as unknown as RecurrenceRule);
  }

  async updateRecurrenceRule(id: Id, updates: Partial<Omit<RecurrenceRule, 'id' | 'createdAt'>>): Promise<RecurrenceRule> {
    const { ownerId: _ownerId, active: _active, primaryAssigneeId: _primary, assigneeIds, ...rest } = updates;
    const result = await apiClient.request<JsonRecord>(`/recurrence-rules/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ ...rest, ...(updates.scope === 'CUSTOM' && assigneeIds ? { assigneeIds } : {}) }) });
    return this.changed({ ...result, assigneeIds: Array.isArray(result.assigneeIds) ? result.assigneeIds : [] } as unknown as RecurrenceRule);
  }

  async deleteRecurrenceRule(id: Id): Promise<boolean> {
    await apiClient.request(`/recurrence-rules/${encodeURIComponent(id)}`, { method: 'DELETE' });
    this.notifyDataChanged();
    return true;
  }

  async toggleRecurrenceRule(id: Id, active: boolean): Promise<RecurrenceRule> {
    const result = await apiClient.request<JsonRecord>(`/recurrence-rules/${encodeURIComponent(id)}/toggle`, { method: 'POST', body: JSON.stringify({ active }) });
    return this.changed({ ...result, assigneeIds: Array.isArray(result.assigneeIds) ? result.assigneeIds : [] } as unknown as RecurrenceRule);
  }

  async generateRecurrenceNext(id: Id, _actorId: Id): Promise<{ task: Task; tasks: Task[]; instance: RecurrenceInstance }> {
    const result = await apiClient.request<JsonRecord>(`/recurrence-rules/${encodeURIComponent(id)}/generate`, { method: 'POST' });
    const tasks = Array.isArray(result.tasks) ? result.tasks.map((task) => asTask(task as JsonRecord)) : [];
    return this.changed({ task: asTask(result.task as JsonRecord), tasks, instance: result.instance as unknown as RecurrenceInstance });
  }

  async submitRecurrenceReport(taskId: Id, input: { summary: string; details?: string; deliverableUrl?: string; notes?: string; fileIds?: Id[] }, _actorId: Id): Promise<TaskSubmission> {
    return this.addSubmission(taskId, input, _actorId);
  }

  async getChatRooms(_userId?: Id): Promise<ChatRoom[]> {
    return apiClient.request<ChatRoom[]>('/chat/rooms');
  }

  async getChatMembers(roomId: Id): Promise<ChatRoomMember[]> {
    return apiClient.request<ChatRoomMember[]>(`/chat/rooms/${encodeURIComponent(roomId)}/members`);
  }

  async getChatMessages(roomId: Id): Promise<ChatMessage[]> {
    return this.allPages<ChatMessage>(`/chat/rooms/${encodeURIComponent(roomId)}/messages`, {}, (message) => message as unknown as ChatMessage);
  }

  async sendChatMessage(roomId: Id, body: string, _senderId: Id): Promise<ChatMessage> {
    const message = await apiClient.request<ChatMessage>(`/chat/rooms/${encodeURIComponent(roomId)}/messages`, { method: 'POST', body: JSON.stringify({ body }) });
    return this.changed(message);
  }

  async markChatRoomAsRead(roomId: Id, _userId: Id): Promise<void> {
    await apiClient.request(`/chat/rooms/${encodeURIComponent(roomId)}/read`, { method: 'POST' });
    this.notifyDataChanged();
  }

  async createChatRoom(kind: 'DIRECT' | 'GROUP', title: string | null, memberUserIds: Id[], _actorId: Id): Promise<ChatRoom> {
    const room = await apiClient.request<ChatRoom>('/chat/rooms', { method: 'POST', body: JSON.stringify({ kind, title, memberIds: memberUserIds }) });
    return this.changed(room);
  }
  async uploadMockFile(): Promise<never> { return unsupported("Upload cần truyền dữ liệu tệp thật"); }

  private async allPages<T>(path: string, params: Record<string, string | number | boolean | null | undefined>, map: (value: JsonRecord) => T): Promise<T[]> {
    const pageSize = 100;
    const results: T[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const value = await apiClient.request<Page<JsonRecord>>(`${path}${queryString({ ...params, page, pageSize })}`);
      const normalized = pageQuery<JsonRecord>(value);
      results.push(...normalized.items.map(map));
      if (results.length >= normalized.total || normalized.items.length === 0) break;
    }
    return results;
  }

  private async withConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index]);
      }
    });
    await Promise.all(runners);
    return results;
  }
}

export type ApiAppError = AppError;
