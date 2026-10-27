import type {
  ApprovalDecision,
  CreateAssigneeRequestInput,
  CreateDeadlineRequestInput,
  CreateTaskInput,
  DecisionInput,
  Id,
  Page,
  ProgressInput,
  SubmitTaskInput,
  Task,
  TaskApproval,
  TaskAssigneeRequest,
  TaskDeadlineRequest,
  TaskPriority,
  TaskQuery,
  UpdateTaskInput,
  User,
} from "../../shared/data-contract";
import { canSeeTask, isTaskOverdue } from "../../shared/data-contract";
import { mockRepository, MockRepository } from "../../mocks/mock-repository";
import { DomainError } from "../../shared/errors";

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

export class TaskService {
  constructor(private repo: MockRepository = mockRepository) {}

  /**
   * Queries tasks with visibility security, filtering, sorting, and pagination.
   */
  public async queryTasks(query: TaskQuery, viewer: User): Promise<Page<Task>> {
    const [allTasks, participants] = await Promise.all([
      this.repo.getTasks(),
      this.repo.getParticipants(),
    ]);

    // 1. Permission filter: Only tasks visible to current viewer
    let visibleTasks = allTasks.filter((task) =>
      canSeeTask(task, viewer, participants)
    );

    // 2. Scope filter
    if (query.scope && query.scope !== "ALL") {
      if (query.scope === "OWNED") {
        visibleTasks = visibleTasks.filter(
          (t) => t.primaryAssigneeId === viewer.id || t.createdById === viewer.id
        );
      } else if (query.scope === "COLLABORATING") {
        const collabTaskIds = new Set(
          participants
            .filter(
              (p) =>
                p.userId === viewer.id &&
                p.role === "COLLABORATOR" &&
                p.invitationStatus === "ACCEPTED"
            )
            .map((p) => p.taskId)
        );
        visibleTasks = visibleTasks.filter((t) => collabTaskIds.has(t.id));
      } else if (query.scope === "WATCHING") {
        const watchingTaskIds = new Set(
          participants
            .filter((p) => p.userId === viewer.id && p.role === "WATCHER")
            .map((p) => p.taskId)
        );
        visibleTasks = visibleTasks.filter((t) => watchingTaskIds.has(t.id));
      }
    }

    // 3. Type filter
    if (query.type && query.type !== "ALL") {
      visibleTasks = visibleTasks.filter((t) => t.type === query.type);
    }

    // 4. Status filter
    if (query.status && query.status !== "ALL") {
      visibleTasks = visibleTasks.filter((t) => t.status === query.status);
    }

    // 5. Priority filter
    if (query.priority && query.priority !== "ALL") {
      visibleTasks = visibleTasks.filter((t) => t.priority === query.priority);
    }

    // 6. Project filter
    if (query.projectId && query.projectId !== "ALL") {
      visibleTasks = visibleTasks.filter((t) => t.projectId === query.projectId);
    }

    // 7. Assignee filter
    if (query.primaryAssigneeId && query.primaryAssigneeId !== "ALL") {
      visibleTasks = visibleTasks.filter(
        (t) => t.primaryAssigneeId === query.primaryAssigneeId
      );
    }

    // 8. Keyword search (code, title, description)
    if (query.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      visibleTasks = visibleTasks.filter(
        (t) =>
          t.code.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      );
    }

    // 9. Due date range & Overdue
    if (query.isOverdue) {
      const now = new Date();
      visibleTasks = visibleTasks.filter((t) => isTaskOverdue(t, now));
    }
    if (query.dueFrom) {
      const fromTime = new Date(query.dueFrom).getTime();
      visibleTasks = visibleTasks.filter(
        (t) => t.dueAt && new Date(t.dueAt).getTime() >= fromTime
      );
    }
    if (query.dueTo) {
      const toTime = new Date(query.dueTo).getTime();
      visibleTasks = visibleTasks.filter(
        (t) => t.dueAt && new Date(t.dueAt).getTime() <= toTime
      );
    }

    // 10. Sorting
    const sortBy = query.sortBy || "UPDATED_AT";
    const sortDirection = query.sortDirection || "DESC";
    const multiplier = sortDirection === "ASC" ? 1 : -1;

    visibleTasks.sort((a, b) => {
      if (sortBy === "DUE_AT") {
        if (!a.dueAt && !b.dueAt) return 0;
        if (!a.dueAt) return 1;
        if (!b.dueAt) return -1;
        return (new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()) * multiplier;
      }
      if (sortBy === "PRIORITY") {
        const diff = (PRIORITY_WEIGHT[a.priority] || 0) - (PRIORITY_WEIGHT[b.priority] || 0);
        return diff * multiplier;
      }
      if (sortBy === "CREATED_AT") {
        return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * multiplier;
      }
      // UPDATED_AT default
      return (
        (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * multiplier
      );
    });

    // 11. Pagination
    const total = visibleTasks.length;
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.max(1, query.pageSize || 10);
    const startIndex = (page - 1) * pageSize;
    const items = visibleTasks.slice(startIndex, startIndex + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Get single task with visibility enforcement.
   */
  public async getTask(id: Id, viewer: User): Promise<Task> {
    const [task, participants] = await Promise.all([
      this.repo.getTaskById(id),
      this.repo.getParticipants(id),
    ]);

    if (!task) {
      throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");
    }

    if (!canSeeTask(task, viewer, participants)) {
      throw new DomainError("FORBIDDEN", "Bạn không có quyền truy cập công việc này");
    }

    return task;
  }

  /**
   * Create task with business role authorization:
   * Only MANAGER can create OFFICIAL tasks.
   * STAFF can only create TEAM or PERSONAL tasks.
   */
  public async createTask(input: CreateTaskInput, viewer: User): Promise<Task> {
    if (input.type === "OFFICIAL" && viewer.role !== "MANAGER") {
      throw new DomainError(
        "FORBIDDEN",
        "Chỉ Trưởng phòng (Manager) mới có quyền tạo và giao việc Chính thức (OFFICIAL). Chuyên viên chỉ có thể tạo việc Nhóm hoặc Cá nhân."
      );
    }

    if (!input.title || !input.title.trim()) {
      throw new DomainError("VALIDATION", "Tiêu đề công việc không được để trống", {
        title: "Vui lòng nhập tiêu đề",
      });
    }

    return this.repo.createTask(input, viewer.id);
  }

  /**
   * Update task with permission checks.
   */
  public async updateTask(
    id: Id,
    input: UpdateTaskInput,
    viewer: User
  ): Promise<Task> {
    const task = await this.getTask(id, viewer);

    if (task.type === "OFFICIAL" && viewer.role !== "MANAGER" && task.createdById !== viewer.id) {
      throw new DomainError(
        "FORBIDDEN",
        "Chỉ Trưởng phòng mới có quyền chỉnh sửa thông tin việc Chính thức"
      );
    }

    if (task.type === "PERSONAL" && task.createdById !== viewer.id) {
      throw new DomainError("FORBIDDEN", "Bạn không có quyền chỉnh sửa việc cá nhân của người khác");
    }

    return this.repo.updateTask(id, input, viewer.id);
  }

  /**
   * Update progress. Allowed for primary assignee, creator, or Manager on OFFICIAL tasks.
   */
  public async updateProgress(
    id: Id,
    input: ProgressInput,
    viewer: User
  ): Promise<Task> {
    const task = await this.getTask(id, viewer);

    const isAssignee = task.primaryAssigneeId === viewer.id;
    const isCreator = task.createdById === viewer.id;
    const isManagerOnOfficial = viewer.role === "MANAGER" && task.type === "OFFICIAL";

    if (!isAssignee && !isCreator && !isManagerOnOfficial) {
      throw new DomainError(
        "FORBIDDEN",
        "Chỉ người chủ trì hoặc Trưởng phòng mới được cập nhật tiến độ công việc này"
      );
    }

    return this.repo.updateTaskProgress(id, input, viewer.id);
  }

  /**
   * Submit deliverable for review.
   */
  public async submitDeliverable(
    taskId: Id,
    input: SubmitTaskInput,
    viewer: User
  ): Promise<void> {
    const task = await this.getTask(taskId, viewer);

    if (task.primaryAssigneeId !== viewer.id) {
      throw new DomainError(
        "FORBIDDEN",
        "Chỉ người chủ trì công việc mới có quyền nộp báo cáo kết quả"
      );
    }

    if (!input.summary || !input.summary.trim()) {
      throw new DomainError("VALIDATION", "Vui lòng nhập tóm tắt kết quả nộp");
    }

    await this.repo.addSubmission(taskId, input, viewer.id);
  }

  /**
   * Publish DRAFT task to TODO
   */
  public async publishTask(taskId: Id, viewer: User): Promise<Task> {
    const task = await this.getTask(taskId, viewer);
    if (task.type === "OFFICIAL" && viewer.role !== "MANAGER") {
      throw new DomainError("FORBIDDEN", "Chỉ Trưởng phòng mới có quyền phát hành và giao việc Chính thức");
    }
    return this.repo.publishTask(taskId, viewer.id);
  }

  /**
   * Start a task in TODO
   */
  public async startTask(taskId: Id, viewer: User): Promise<Task> {
    const task = await this.getTask(taskId, viewer);
    const isAssignee = task.primaryAssigneeId === viewer.id;
    const isManagerOnOfficial = viewer.role === "MANAGER" && task.type === "OFFICIAL";
    if (!isAssignee && !isManagerOnOfficial && task.createdById !== viewer.id) {
      throw new DomainError("FORBIDDEN", "Chỉ người chủ trì hoặc Trưởng phòng mới được bấm bắt đầu thực hiện");
    }
    return this.repo.startTask(taskId, viewer.id);
  }

  /**
   * Manager updates task details after assignment (dueAt, assignee, priority)
   */
  public async managerUpdateTaskDetails(
    taskId: Id,
    updates: {
      dueAt?: string | null;
      primaryAssigneeId?: string | null;
      priority?: TaskPriority;
    },
    reason: string,
    viewer: User
  ): Promise<Task> {
    const task = await this.getTask(taskId, viewer);
    if (task.type === "OFFICIAL" && viewer.role !== "MANAGER") {
      throw new DomainError("FORBIDDEN", "Chỉ Trưởng phòng mới có quyền điều chỉnh thông tin nhiệm vụ Chính thức sau khi giao việc");
    }
    return this.repo.managerUpdateTaskDetails(taskId, updates, reason, viewer.id);
  }

  /**
   * Cancel task
   */
  public async cancelTask(taskId: Id, reason: string, viewer: User): Promise<Task> {
    const task = await this.getTask(taskId, viewer);
    if (task.type === "OFFICIAL" && viewer.role !== "MANAGER") {
      throw new DomainError("FORBIDDEN", "Chỉ Trưởng phòng mới có quyền hủy nhiệm vụ Chính thức");
    }
    if (task.type !== "OFFICIAL" && task.createdById !== viewer.id && viewer.role !== "MANAGER") {
      throw new DomainError("FORBIDDEN", "Bạn không có quyền hủy nhiệm vụ này");
    }
    return this.repo.cancelTask(taskId, reason, viewer.id);
  }

  /**
   * Reopen completed task
   */
  public async reopenTask(taskId: Id, reason: string, viewer: User): Promise<Task> {
    const task = await this.getTask(taskId, viewer);
    if (task.type === "OFFICIAL" && viewer.role !== "MANAGER") {
      throw new DomainError("FORBIDDEN", "Chỉ Trưởng phòng mới có quyền mở lại nhiệm vụ Chính thức đã hoàn thành");
    }
    return this.repo.reopenTask(taskId, reason, viewer.id);
  }

  /**
   * Decide approval on submission
   */
  public async decideApproval(
    submissionId: Id,
    decision: ApprovalDecision,
    reason: string | null,
    viewer: User
  ): Promise<TaskApproval> {
    if (viewer.role !== "MANAGER") {
      throw new DomainError("FORBIDDEN", "Chỉ Trưởng phòng mới có quyền duyệt hoặc trả lại kết quả");
    }
    return this.repo.decideApproval(submissionId, decision, reason, viewer.id);
  }

  /**
   * Create deadline request
   */
  public async createDeadlineRequest(
    taskId: Id,
    input: CreateDeadlineRequestInput,
    viewer: User
  ): Promise<TaskDeadlineRequest> {
    const task = await this.getTask(taskId, viewer);
    if (task.primaryAssigneeId !== viewer.id) {
      throw new DomainError("FORBIDDEN", "Chỉ người chủ trì công việc mới có quyền tạo yêu cầu gia hạn");
    }
    return this.repo.createDeadlineRequest(taskId, input, viewer.id);
  }

  /**
   * Decide deadline request
   */
  public async decideDeadlineRequest(
    requestId: Id,
    input: DecisionInput,
    viewer: User
  ): Promise<TaskDeadlineRequest> {
    if (viewer.role !== "MANAGER") {
      throw new DomainError("FORBIDDEN", "Chỉ Trưởng phòng mới có quyền quyết định đề nghị gia hạn");
    }
    return this.repo.decideDeadlineRequest(requestId, input, viewer.id);
  }

  /**
   * Create assignee change request
   */
  public async createAssigneeRequest(
    taskId: Id,
    input: CreateAssigneeRequestInput,
    viewer: User
  ): Promise<TaskAssigneeRequest> {
    const task = await this.getTask(taskId, viewer);
    if (task.primaryAssigneeId !== viewer.id) {
      throw new DomainError("FORBIDDEN", "Chỉ người chủ trì công việc mới có quyền đề nghị đổi người chủ trì");
    }
    return this.repo.createAssigneeRequest(taskId, input, viewer.id);
  }

  /**
   * Decide assignee change request
   */
  public async decideAssigneeRequest(
    requestId: Id,
    input: DecisionInput,
    viewer: User
  ): Promise<TaskAssigneeRequest> {
    if (viewer.role !== "MANAGER") {
      throw new DomainError("FORBIDDEN", "Chỉ Trưởng phòng mới có quyền quyết định đề nghị đổi chủ trì");
    }
    return this.repo.decideAssigneeRequest(requestId, input, viewer.id);
  }

  /**
   * Convert TEAM task to OFFICIAL task (Manager only)
   */
  public async convertTeamToOfficial(
    taskId: Id,
    data: { primaryAssigneeId: Id; dueAt: string; priority?: TaskPriority },
    viewer: User
  ): Promise<Task> {
    if (viewer.role !== "MANAGER") {
      throw new DomainError("FORBIDDEN", "Chỉ Trưởng phòng mới có quyền nâng cấp việc nhóm thành việc chính thức");
    }
    return this.repo.convertTeamToOfficial(taskId, data, viewer.id);
  }

  /**
   * Create subtask for parent task
   */
  public async createSubtask(
    parentTaskId: Id,
    input: {
      title: string;
      primaryAssigneeId: Id;
      dueAt: string | null;
      priority?: TaskPriority;
      deliverable?: string;
    },
    viewer: User
  ): Promise<Task> {
    const parent = await this.getTask(parentTaskId, viewer);
    const isAssignee = parent.primaryAssigneeId === viewer.id;
    const isManagerOnOfficial = viewer.role === "MANAGER" && parent.type === "OFFICIAL";
    if (!isAssignee && !isManagerOnOfficial && parent.createdById !== viewer.id) {
      throw new DomainError("FORBIDDEN", "Bạn không có quyền tạo việc con cho nhiệm vụ này");
    }
    return this.repo.createSubtask(parentTaskId, input, viewer.id);
  }

  /**
   * Helper check to see if an action is allowed on UI.
   */
  public canCreateOfficialTask(viewer: User): boolean {
    return viewer.role === "MANAGER";
  }

  public canManageTask(task: Task, viewer: User): boolean {
    if (viewer.role === "MANAGER" && task.type === "OFFICIAL") return true;
    return task.createdById === viewer.id;
  }
}

export const taskService = new TaskService();
