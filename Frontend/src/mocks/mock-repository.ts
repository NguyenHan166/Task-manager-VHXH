import type {
    AppSettings,
    ApprovalDecision,
    ChatMessage,
    ChatRoom,
    ChatRoomMember,
    CreateAssigneeRequestInput,
    CreateDeadlineRequestInput,
    CreateTaskInput,
    DecisionInput,
    FileLink,
    FileObject,
    Id,
    MockDb,
    Notification,
    ParticipantRole,
    ProgressInput,
    Project,
    RecurrenceInstance,
    RecurrenceRule,
    SubmitTaskInput,
    Task,
    TaskApproval,
    TaskAssigneeRequest,
    TaskComment,
    TaskDeadlineRequest,
    TaskEvent,
    TaskParticipant,
    TaskPriority,
    TaskStatus,
    TaskSubmission,
    UpdateTaskInput,
    User,
    UserRole,
} from "../shared/data-contract";
import { createMockSeed } from "./mock-seed";
import { DomainError } from "../shared/errors";
import { toIsoUtc } from "../shared/datetime";

const STORAGE_KEY = "office_workspace_mock_db_v1";
const SIMULATE_FAILURE_KEY = "office_workspace_mock_simulate_failure";

export class MockRepository {
    private db: MockDb | null = null;
    private simulateFailure = false;
    private listeners: Set<() => void> = new Set();

    constructor() {
        try {
            this.simulateFailure =
                localStorage.getItem(SIMULATE_FAILURE_KEY) === "true";
        } catch {
            this.simulateFailure = false;
        }
    }

    // --- Core / State Lifecycle ---

    private async delay(min = 150, max = 350): Promise<void> {
        const ms = Math.floor(Math.random() * (max - min + 1)) + min;
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    public setSimulateFailure(enabled: boolean): void {
        this.simulateFailure = enabled;
        try {
            localStorage.setItem(SIMULATE_FAILURE_KEY, String(enabled));
        } catch {
            // ignore
        }
        this.notify();
    }

    public getSimulateFailure(): boolean {
        return this.simulateFailure;
    }

    private checkFailure(): void {
        if (this.simulateFailure) {
            throw new DomainError(
                "MOCK_FAILURE",
                "Mô phỏng sự cố kết nối máy chủ (Dev Mode: Bật chế độ lỗi)",
            );
        }
    }

    private getDb(): MockDb {
        if (this.db) return this.db;

        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as MockDb;
                if (
                    parsed &&
                    parsed.schemaVersion === 1 &&
                    Array.isArray(parsed.users) &&
                    Array.isArray(parsed.tasks) &&
                    Array.isArray(parsed.projects)
                ) {
                    this.db = parsed;
                    return this.db;
                }
            }
        } catch (err) {
            console.warn(
                "Dữ liệu mock cũ/hỏng, tiến hành khởi tạo lại seed:",
                err,
            );
        }

        // Initialize fresh seed once relative to current time
        this.db = createMockSeed(new Date());
        this.persist();
        return this.db;
    }

    private persist(): void {
        if (this.db) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
            } catch (err) {
                console.error("Lỗi khi ghi dữ liệu vào localStorage:", err);
            }
        }
    }

    public subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notify(): void {
        this.listeners.forEach((listener) => {
            try {
                listener();
            } catch (err) {
                console.error("Lỗi trong subscriber của MockRepository:", err);
            }
        });
    }

    /**
     * Resets the repository with fresh seed data relative to current time.
     */
    public async resetSeed(): Promise<MockDb> {
        await this.delay();
        this.db = createMockSeed(new Date());
        this.persist();
        this.notify();
        return this.db;
    }

    public getSnapshot(): MockDb {
        return JSON.parse(JSON.stringify(this.getDb()));
    }

    // --- Settings ---

    public async getSettings(): Promise<AppSettings> {
        await this.delay();
        this.checkFailure();
        return { ...this.getDb().settings };
    }

    public async updateSettings(
        partial: Partial<AppSettings>,
    ): Promise<AppSettings> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        db.settings = { ...db.settings, ...partial };
        this.persist();
        this.notify();
        return { ...db.settings };
    }

    // --- Users ---

    public async getUsers(): Promise<User[]> {
        await this.delay();
        this.checkFailure();
        return [...this.getDb().users];
    }

    public async getUserById(id: Id): Promise<User | null> {
        await this.delay();
        this.checkFailure();
        const user = this.getDb().users.find((u) => u.id === id);
        return user ? { ...user } : null;
    }

    public async createUser(
        input: {
            email: string;
            displayName: string;
            jobTitle?: string;
            role?: UserRole;
            phoneNumber?: string;
            department?: string;
            avatarUrl?: string | null;
            initialPassword?: string;
            username?: string;
        },
        actorId: Id,
    ): Promise<User & { temporaryPassword?: string }> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const actor = db.users.find((u) => u.id === actorId);
        if (actor && actor.role !== "MANAGER") {
            throw new DomainError(
                "FORBIDDEN",
                "Chỉ Trưởng phòng (Quản trị hệ thống) mới có quyền tạo tài khoản thành viên mới",
            );
        }

        const cleanEmail = (input.email || input.username || "")
            .trim()
            .toLowerCase();
        if (!cleanEmail) {
            throw new DomainError(
                "VALIDATION",
                "Tên đăng nhập (Email công vụ) không được để trống",
            );
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
            throw new DomainError(
                "VALIDATION",
                "Tên đăng nhập bắt buộc phải là một địa chỉ email hợp lệ (ví dụ: canbo@agency.gov.vn)",
            );
        }
        if (
            db.users.some(
                (u) =>
                    u.email?.toLowerCase() === cleanEmail ||
                    u.username.toLowerCase() === cleanEmail,
            )
        ) {
            throw new DomainError(
                "CONFLICT",
                `Tên đăng nhập (Email) "${cleanEmail}" đã tồn tại trên hệ thống`,
            );
        }

        const trimmedName = input.displayName.trim();
        if (!trimmedName) {
            throw new DomainError(
                "VALIDATION",
                "Họ và tên không được để trống",
            );
        }

        const count = db.users.length + 1;
        const newUserId = `u${String(count).padStart(2, "0")}`;
        const tempPassword =
            input.initialPassword?.trim() ||
            `Ows@${Math.floor(100000 + Math.random() * 900000)}`;

        const newUser: User = {
            id: newUserId,
            username: cleanEmail,
            email: cleanEmail,
            displayName: trimmedName,
            jobTitle: input.jobTitle?.trim() || "Chuyên viên nghiệp vụ",
            role: input.role || "STAFF",
            status: "ACTIVE",
            phoneNumber: input.phoneNumber?.trim() || undefined,
            department: input.department?.trim() || "Phòng Nghiệp vụ",
            avatarUrl: input.avatarUrl || null,
            createdAt: toIsoUtc(),
            lastLoginAt: null,
        };

        db.users.push(newUser);
        this.persist();
        this.notify();
        return { ...newUser, temporaryPassword: tempPassword };
    }

    public async updateUser(
        id: Id,
        updates: Partial<
            Pick<
                User,
                | "displayName"
                | "jobTitle"
                | "status"
                | "role"
                | "email"
                | "phoneNumber"
                | "department"
                | "username"
            >
        >,
        actorId: Id,
    ): Promise<User> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const idx = db.users.findIndex((u) => u.id === id);
        if (idx === -1)
            throw new DomainError("NOT_FOUND", "Không tìm thấy người dùng");

        const targetUser = db.users[idx];
        const actor = db.users.find((u) => u.id === actorId);

        // Rule 1: Non-manager cannot change roles
        if (updates.role !== undefined && updates.role !== targetUser.role) {
            if (actor?.role !== "MANAGER") {
                throw new DomainError(
                    "FORBIDDEN",
                    "Chuyên viên hoặc Phó phòng không có quyền thay đổi vai trò hệ thống",
                );
            }

            // Rule 1b: Cannot demote the last active manager
            if (targetUser.role === "MANAGER" && updates.role !== "MANAGER") {
                const remainingActiveManagers = db.users.filter(
                    (u) =>
                        u.role === "MANAGER" &&
                        u.status === "ACTIVE" &&
                        u.id !== id,
                );
                if (remainingActiveManagers.length === 0) {
                    throw new DomainError(
                        "CONFLICT",
                        "Không thể hạ vai trò của Trưởng phòng hoạt động duy nhất của hệ thống.",
                    );
                }
            }
        }

        // Rule 2: Cannot lock last active manager & Cannot self-lock
        if (
            updates.status !== undefined &&
            updates.status !== targetUser.status
        ) {
            if (actor?.role !== "MANAGER") {
                throw new DomainError(
                    "FORBIDDEN",
                    "Chỉ Quản trị viên (Trưởng phòng) mới có quyền khóa hoặc mở khóa tài khoản",
                );
            }

            if (updates.status === "LOCKED") {
                if (actorId === id) {
                    throw new DomainError(
                        "VALIDATION",
                        "Quản trị viên không thể tự khóa tài khoản của chính mình.",
                    );
                }

                if (targetUser.role === "MANAGER") {
                    const remainingActiveManagers = db.users.filter(
                        (u) =>
                            u.role === "MANAGER" &&
                            u.status === "ACTIVE" &&
                            u.id !== id,
                    );
                    if (remainingActiveManagers.length === 0) {
                        throw new DomainError(
                            "CONFLICT",
                            "Không thể khóa hoặc vô hiệu hóa Trưởng phòng hoạt động cuối cùng của hệ thống.",
                        );
                    }
                }
            }
        }

        // Rule 3: Regular users can only update their own displayName / jobTitle / phone
        if (actorId !== id && actor?.role !== "MANAGER") {
            throw new DomainError(
                "FORBIDDEN",
                "Bạn chỉ có thể chỉnh sửa hồ sơ của chính mình",
            );
        }

        let nextEmail = targetUser.email;
        if (updates.email !== undefined || updates.username !== undefined) {
            const rawEmail = (updates.email || updates.username || "")
                .trim()
                .toLowerCase();
            if (!rawEmail) {
                throw new DomainError(
                    "VALIDATION",
                    "Tên đăng nhập (Email) không được để trống",
                );
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
                throw new DomainError(
                    "VALIDATION",
                    "Tên đăng nhập bắt buộc phải là một địa chỉ email hợp lệ",
                );
            }
            if (
                db.users.some(
                    (u) =>
                        u.id !== id &&
                        (u.email?.toLowerCase() === rawEmail ||
                            u.username.toLowerCase() === rawEmail),
                )
            ) {
                throw new DomainError(
                    "CONFLICT",
                    `Email "${rawEmail}" đã được sử dụng bởi một tài khoản khác`,
                );
            }
            nextEmail = rawEmail;
        }

        const updated: User = {
            ...targetUser,
            username: nextEmail,
            email: nextEmail,
            ...(updates.displayName !== undefined
                ? { displayName: updates.displayName.trim() }
                : {}),
            ...(updates.jobTitle !== undefined
                ? { jobTitle: updates.jobTitle.trim() }
                : {}),
            ...(updates.department !== undefined
                ? { department: updates.department.trim() }
                : {}),
            ...(updates.phoneNumber !== undefined
                ? { phoneNumber: updates.phoneNumber.trim() }
                : {}),
            ...(updates.status !== undefined && actor?.role === "MANAGER"
                ? { status: updates.status }
                : {}),
            ...(updates.role !== undefined && actor?.role === "MANAGER"
                ? { role: updates.role }
                : {}),
        };

        db.users[idx] = updated;
        this.persist();
        this.notify();
        return { ...updated };
    }

    public async resetPassword(
        userId: Id,
        newPassword?: string,
        actorId?: Id,
    ): Promise<{ temporaryPassword: string; message: string }> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        if (actorId) {
            const actor = db.users.find((u) => u.id === actorId);
            if (actor?.role !== "MANAGER") {
                throw new DomainError(
                    "FORBIDDEN",
                    "Chỉ Quản trị viên (Trưởng phòng) mới có quyền đặt lại mật khẩu cho thành viên",
                );
            }
        }

        const user = db.users.find((u) => u.id === userId);
        if (!user) {
            throw new DomainError("NOT_FOUND", "Không tìm thấy người dùng");
        }

        const tempPassword =
            newPassword?.trim() ||
            `Ows@${Math.floor(100000 + Math.random() * 900000)}`;

        // Notify user about password reset
        db.notifications.push({
            id: `ntf_pwd_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            recipientId: userId,
            type: "TASK_UPDATED",
            title: "Mật khẩu tài khoản đã được đặt lại",
            body: `Quản trị viên hệ thống đã đặt lại mật khẩu cho tài khoản ${user.displayName} (${user.email}). Mật khẩu tạm thời mới là: ${tempPassword}`,
            entityType: "TASK",
            entityId: "u01",
            createdAt: toIsoUtc(),
            readAt: null,
        });

        this.persist();
        this.notify();
        return {
            temporaryPassword: tempPassword,
            message: `Đã đặt lại mật khẩu thành công cho ${user.displayName}`,
        };
    }

    // --- Projects ---

    public async getProjects(): Promise<Project[]> {
        await this.delay();
        this.checkFailure();
        return [...this.getDb().projects];
    }

    public async getProjectById(id: Id): Promise<Project | null> {
        await this.delay();
        this.checkFailure();
        const p = this.getDb().projects.find((proj) => proj.id === id);
        return p ? { ...p } : null;
    }

    public async createProject(
        input: Omit<Project, "id" | "createdAt">,
    ): Promise<Project> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const newProject: Project = {
            ...input,
            id: `p${String(db.projects.length + 1).padStart(2, "0")}`,
            createdAt: toIsoUtc(),
        };
        db.projects.push(newProject);
        this.persist();
        this.notify();
        return { ...newProject };
    }

    public async updateProject(
        id: Id,
        updates: Partial<Omit<Project, "id" | "createdAt">>,
    ): Promise<Project> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const idx = db.projects.findIndex((p) => p.id === id);
        if (idx === -1)
            throw new DomainError("NOT_FOUND", "Không tìm thấy dự án");

        const updated: Project = {
            ...db.projects[idx],
            ...updates,
        };
        db.projects[idx] = updated;
        this.persist();
        this.notify();
        return { ...updated };
    }

    // --- Tasks ---

    public async getTasks(): Promise<Task[]> {
        await this.delay();
        this.checkFailure();
        return this.getDb().tasks.filter((task) => !task.archivedAt);
    }

    public async getArchivedTasks(): Promise<Task[]> {
        await this.delay();
        this.checkFailure();
        return this.getDb().tasks.filter(
            (task) =>
                task.archivedAt &&
                task.type === "OFFICIAL" &&
                task.status === "DONE" &&
                task.approvedAt &&
                task.approvedById,
        );
    }

    public async getTaskById(id: Id): Promise<Task | null> {
        await this.delay();
        this.checkFailure();
        const task = this.getDb().tasks.find((t) => t.id === id);
        return task && !task.archivedAt ? { ...task } : null;
    }

    public async createTask(
        input: CreateTaskInput & { isDraft?: boolean },
        actorId: Id,
    ): Promise<Task> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const now = new Date();
        const nowIso = toIsoUtc(now);

        const count = db.tasks.length + 1;
        const prefix =
            input.type === "OFFICIAL"
                ? "CV"
                : input.type === "TEAM"
                  ? "NH"
                  : "CN";
        const year = new Intl.DateTimeFormat("en-US", {
            year: "numeric",
            timeZone: "Asia/Ho_Chi_Minh",
        }).format(now);
        const code = `${prefix}-${year}-${String(count).padStart(4, "0")}`;
        const newTaskId = `t${String(count).padStart(2, "0")}`;

        const isDraft = !!input.isDraft;
        const status: TaskStatus = isDraft ? "DRAFT" : "TODO";

        const newTask: Task = {
            id: newTaskId,
            code,
            type: input.type,
            title: input.title ? input.title.trim() : "(Chưa đặt tiêu đề)",
            description: input.description ? input.description.trim() : "",
            deliverable: input.deliverable ? input.deliverable.trim() : "",
            status,
            priority: input.priority || "NORMAL",
            progressPercent: 0,
            createdById: actorId,
            primaryAssigneeId: input.primaryAssigneeId,
            projectId: input.projectId,
            parentTaskId: input.parentTaskId,
            assignedAt: !isDraft && input.primaryAssigneeId ? nowIso : null,
            dueAt: input.dueAt,
            completedAt: null,
            approvedById: null,
            approvedAt: null,
            isBlocked: false,
            blockedReason: null,
            createdAt: nowIso,
            updatedAt: nowIso,
            archivedAt: null,
        };

        db.tasks.push(newTask);

        // Add participants
        input.collaboratorIds.forEach((uid, idx) => {
            db.participants.push({
                id: `tp_${newTaskId}_c_${idx + 1}`,
                taskId: newTaskId,
                userId: uid,
                role: "COLLABORATOR",
                invitationStatus:
                    input.type === "OFFICIAL" ? "ACCEPTED" : "PENDING",
                invitedAt: nowIso,
                respondedAt: input.type === "OFFICIAL" ? nowIso : null,
            });
        });

        input.watcherIds.forEach((uid, idx) => {
            db.participants.push({
                id: `tp_${newTaskId}_w_${idx + 1}`,
                taskId: newTaskId,
                userId: uid,
                role: "WATCHER",
                invitationStatus: "ACCEPTED",
                invitedAt: nowIso,
                respondedAt: nowIso,
            });
        });

        // Event log
        db.events.push({
            id: `e_${Date.now()}_1`,
            taskId: newTaskId,
            actorId,
            kind: "CREATED",
            note: isDraft
                ? `Khởi tạo công việc [${newTask.code}] ${newTask.title}`
                : `Tạo công việc [${newTask.code}] ${newTask.title}`,
            before: null,
            after: { status: newTask.status },
            createdAt: nowIso,
        });

        if (!isDraft) {
            db.events.push({
                id: `e_${Date.now()}_2`,
                taskId: newTaskId,
                actorId,
                kind: "PUBLISHED",
                note: `Phát hành và giao nhiệm vụ cho người chủ trì`,
                before: { status: "DRAFT" },
                after: {
                    status: newTask.status,
                    primaryAssigneeId: newTask.primaryAssigneeId,
                    dueAt: newTask.dueAt,
                },
                createdAt: nowIso,
            });

            // Notification to assignee
            if (
                newTask.primaryAssigneeId &&
                newTask.primaryAssigneeId !== actorId
            ) {
                db.notifications.push({
                    id: `n_${Date.now()}_assignee`,
                    recipientId: newTask.primaryAssigneeId,
                    type: "TASK_ASSIGNED",
                    title: "Bạn được giao nhiệm vụ mới",
                    body: `Nhiệm vụ: ${newTask.title} (${newTask.code})`,
                    entityType: "TASK",
                    entityId: newTaskId,
                    createdAt: nowIso,
                    readAt: null,
                });
            }

            // Notifications to collaborators
            input.collaboratorIds.forEach((uid) => {
                if (uid !== actorId) {
                    db.notifications.push({
                        id: `n_${Date.now()}_${uid}`,
                        recipientId: uid,
                        type: "TASK_ASSIGNED",
                        title: "Nhiệm vụ phối hợp mới",
                        body: `Bạn được phân công phối hợp nhiệm vụ [${newTask.code}] ${newTask.title}`,
                        entityType: "TASK",
                        entityId: newTaskId,
                        createdAt: nowIso,
                        readAt: null,
                    });
                }
            });
        }

        this.persist();
        this.notify();
        return { ...newTask };
    }

    public async publishTask(taskId: Id, actorId: Id): Promise<Task> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const taskIdx = db.tasks.findIndex((t) => t.id === taskId);
        if (taskIdx === -1) {
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");
        }

        const task = db.tasks[taskIdx];
        if (task.status !== "DRAFT") {
            throw new DomainError(
                "CONFLICT",
                "Công việc không ở trạng thái Bản nháp (DRAFT)",
            );
        }

        // Strict validation before publishing
        if (
            !task.title ||
            !task.title.trim() ||
            task.title === "(Chưa đặt tiêu đề)"
        ) {
            throw new DomainError(
                "VALIDATION",
                "Công việc bắt buộc phải có tiêu đề trước khi giao việc",
            );
        }
        if (!task.primaryAssigneeId) {
            throw new DomainError(
                "VALIDATION",
                "Bắt buộc phải chỉ định một người chủ trì trước khi giao việc",
            );
        }
        if (!task.dueAt) {
            throw new DomainError(
                "VALIDATION",
                "Bắt buộc phải thiết lập hạn hoàn thành trước khi giao việc",
            );
        }

        const nowIso = toIsoUtc();
        const updated: Task = {
            ...task,
            status: "TODO",
            assignedAt: nowIso,
            updatedAt: nowIso,
        };
        db.tasks[taskIdx] = updated;

        db.events.push({
            id: `e_${Date.now()}`,
            taskId,
            actorId,
            kind: "PUBLISHED",
            note: `Phát hành và giao nhiệm vụ cho người chủ trì`,
            before: { status: "DRAFT" },
            after: {
                status: "TODO",
                primaryAssigneeId: task.primaryAssigneeId,
                dueAt: task.dueAt,
            },
            createdAt: nowIso,
        });

        // Notify assignee
        if (task.primaryAssigneeId && task.primaryAssigneeId !== actorId) {
            db.notifications.push({
                id: `n_${Date.now()}_assignee`,
                recipientId: task.primaryAssigneeId,
                type: "TASK_ASSIGNED",
                title: "Bạn được giao nhiệm vụ mới",
                body: `Nhiệm vụ: ${task.title} (${task.code})`,
                entityType: "TASK",
                entityId: taskId,
                createdAt: nowIso,
                readAt: null,
            });
        }

        // Notify collaborators
        db.participants
            .filter(
                (p) =>
                    p.taskId === taskId &&
                    p.role === "COLLABORATOR" &&
                    p.userId !== actorId,
            )
            .forEach((p) => {
                db.notifications.push({
                    id: `n_${Date.now()}_${p.userId}`,
                    recipientId: p.userId,
                    type: "TASK_ASSIGNED",
                    title: "Nhiệm vụ phối hợp mới",
                    body: `Bạn được phân công phối hợp nhiệm vụ [${task.code}] ${task.title}`,
                    entityType: "TASK",
                    entityId: taskId,
                    createdAt: nowIso,
                    readAt: null,
                });
            });

        this.persist();
        this.notify();
        return { ...updated };
    }

    public async startTask(taskId: Id, actorId: Id): Promise<Task> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const taskIdx = db.tasks.findIndex((t) => t.id === taskId);
        if (taskIdx === -1) {
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");
        }

        const task = db.tasks[taskIdx];
        if (task.status !== "TODO") {
            throw new DomainError(
                "CONFLICT",
                "Nhiệm vụ không ở trạng thái Chưa làm (TODO)",
            );
        }

        const nowIso = toIsoUtc();
        const updated: Task = {
            ...task,
            status: "IN_PROGRESS",
            updatedAt: nowIso,
        };
        db.tasks[taskIdx] = updated;

        db.events.push({
            id: `e_${Date.now()}`,
            taskId,
            actorId,
            kind: "STARTED",
            note: "Bắt đầu thực hiện nhiệm vụ",
            before: { status: "TODO" },
            after: { status: "IN_PROGRESS" },
            createdAt: nowIso,
        });

        this.persist();
        this.notify();
        return { ...updated };
    }

    public async managerUpdateTaskDetails(
        taskId: Id,
        updates: {
            dueAt?: string | null;
            primaryAssigneeId?: string | null;
            priority?: TaskPriority;
        },
        reason: string,
        actorId: Id,
    ): Promise<Task> {
        await this.delay();
        this.checkFailure();
        const trimmedReason = reason.trim();
        if (!trimmedReason) {
            throw new DomainError(
                "VALIDATION",
                "Bắt buộc nhập lý do điều chỉnh thông tin nhiệm vụ",
            );
        }

        const db = this.getDb();
        const taskIdx = db.tasks.findIndex((t) => t.id === taskId);
        if (taskIdx === -1)
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");

        const task = db.tasks[taskIdx];
        const nowIso = toIsoUtc();

        const oldDueAt = task.dueAt;
        const oldAssigneeId = task.primaryAssigneeId;
        const oldPriority = task.priority;

        let hasChanges = false;
        const updated: Task = { ...task, updatedAt: nowIso };

        if (updates.dueAt !== undefined && updates.dueAt !== oldDueAt) {
            hasChanges = true;
            updated.dueAt = updates.dueAt;
            db.events.push({
                id: `e_${Date.now()}_due`,
                taskId,
                actorId,
                kind: "DEADLINE_CHANGED",
                note: `Điều chỉnh thời hạn hoàn thành. Lý do: ${trimmedReason}`,
                before: { dueAt: oldDueAt },
                after: { dueAt: updates.dueAt },
                createdAt: nowIso,
            });

            if (task.primaryAssigneeId) {
                db.notifications.push({
                    id: `n_${Date.now()}_due`,
                    recipientId: task.primaryAssigneeId,
                    type: "TASK_UPDATED",
                    title: "Thời hạn nhiệm vụ đã thay đổi",
                    body: `Công việc [${task.code}] đã được điều chỉnh hạn. Lý do: ${trimmedReason}`,
                    entityType: "TASK",
                    entityId: taskId,
                    createdAt: nowIso,
                    readAt: null,
                });
            }
        }

        if (
            updates.primaryAssigneeId !== undefined &&
            updates.primaryAssigneeId !== oldAssigneeId
        ) {
            hasChanges = true;
            updated.primaryAssigneeId = updates.primaryAssigneeId;
            db.events.push({
                id: `e_${Date.now()}_assignee`,
                taskId,
                actorId,
                kind: "ASSIGNEE_CHANGED",
                note: `Thay đổi người chủ trì. Lý do: ${trimmedReason}`,
                before: { primaryAssigneeId: oldAssigneeId },
                after: { primaryAssigneeId: updates.primaryAssigneeId },
                createdAt: nowIso,
            });

            // Notify new assignee
            if (updates.primaryAssigneeId) {
                db.notifications.push({
                    id: `n_${Date.now()}_new_assignee`,
                    recipientId: updates.primaryAssigneeId,
                    type: "TASK_ASSIGNED",
                    title: "Bạn được giao làm chủ trì nhiệm vụ",
                    body: `Bạn được chỉ định làm chủ trì công việc [${task.code}] ${task.title}. Lý do: ${trimmedReason}`,
                    entityType: "TASK",
                    entityId: taskId,
                    createdAt: nowIso,
                    readAt: null,
                });
            }

            // Notify old assignee
            if (oldAssigneeId) {
                db.notifications.push({
                    id: `n_${Date.now()}_old_assignee`,
                    recipientId: oldAssigneeId,
                    type: "TASK_UPDATED",
                    title: "Thay đổi phân công chủ trì",
                    body: `Nhiệm vụ [${task.code}] đã được chuyển giao cho người khác chủ trì. Lý do: ${trimmedReason}`,
                    entityType: "TASK",
                    entityId: taskId,
                    createdAt: nowIso,
                    readAt: null,
                });
            }
        }

        if (
            updates.priority !== undefined &&
            updates.priority !== oldPriority
        ) {
            hasChanges = true;
            updated.priority = updates.priority;
            db.events.push({
                id: `e_${Date.now()}_priority`,
                taskId,
                actorId,
                kind: "PROGRESS_UPDATED",
                note: `Đổi mức độ ưu tiên từ ${oldPriority} sang ${updates.priority}. Lý do: ${trimmedReason}`,
                before: { priority: oldPriority },
                after: { priority: updates.priority },
                createdAt: nowIso,
            });
        }

        if (!hasChanges) {
            return { ...task };
        }

        db.tasks[taskIdx] = updated;
        this.persist();
        this.notify();
        return { ...updated };
    }

    public async cancelTask(
        taskId: Id,
        _actorId: Id,
        mode: "cancel" | "finish" = "cancel",
    ): Promise<void> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const taskIdx = db.tasks.findIndex((t) => t.id === taskId && !t.archivedAt);
        if (taskIdx === -1)
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");

        const task = db.tasks[taskIdx];
        const actor = db.users.find((user) => user.id === _actorId);
        if (mode === "finish" && actor?.role !== "MANAGER") {
            throw new DomainError(
                "FORBIDDEN",
                "Chỉ Trưởng phòng mới có quyền lưu trữ công việc",
            );
        }
        if (
            mode === "cancel" &&
            actor?.role !== "MANAGER" &&
            actor?.role !== "DEPUTY_MANAGER"
        ) {
            throw new DomainError(
                "FORBIDDEN",
                "Chỉ Trưởng phòng hoặc Phó phòng mới có quyền thu hồi công việc",
            );
        }
        if (task.type === "PERSONAL") {
            throw new DomainError(
                "FORBIDDEN",
                "Công việc cá nhân chỉ do chủ sở hữu xóa được",
            );
        }
        if (
            mode === "finish" &&
            (task.type !== "OFFICIAL" ||
                task.status !== "DONE" ||
                !task.approvedAt ||
                !task.approvedById)
        ) {
            throw new DomainError(
                "CONFLICT",
                "Chỉ công việc đã được duyệt hoàn thành mới có thể lưu trữ",
            );
        }
        if (
            mode === "cancel" &&
            !["DRAFT", "TODO", "IN_PROGRESS", "IN_REVIEW"].includes(task.status)
        ) {
            throw new DomainError(
                "CONFLICT",
                "Không thể thu hồi công việc ở trạng thái hiện tại",
            );
        }

        const recipientIds = new Set([
            ...(task.primaryAssigneeId ? [task.primaryAssigneeId] : []),
            ...db.participants
                .filter(
                    (participant) =>
                        participant.taskId === taskId &&
                        participant.role === "COLLABORATOR" &&
                        participant.invitationStatus === "ACCEPTED",
                )
                .map((participant) => participant.userId),
        ]);
        recipientIds.delete(_actorId);
        const submissionIds = new Set(
            db.submissions
                .filter((item) => item.taskId === taskId)
                .map((item) => item.id),
        );
        const commentIds = new Set(
            db.comments
                .filter((item) => item.taskId === taskId)
                .map((item) => item.id),
        );
        const fileIds = new Set(
            db.fileLinks
                .filter(
                    (link) =>
                        (link.entityType === "TASK" &&
                            link.entityId === taskId) ||
                        (link.entityType === "SUBMISSION" &&
                            submissionIds.has(link.entityId)) ||
                        (link.entityType === "COMMENT" &&
                            commentIds.has(link.entityId)),
                )
                .map((link) => link.fileId),
        );

        const nowIso = toIsoUtc();
        db.tasks[taskIdx] = {
            ...task,
            archivedAt: nowIso,
            updatedAt: nowIso,
        };
        db.events.push({
            id: `e_${Date.now()}_${mode}`,
            taskId,
            actorId: _actorId,
            kind: mode === "finish" ? "FINISHED" : "DELETED",
            note:
                mode === "finish"
                    ? "Đã lưu trữ công việc sau khi duyệt hoàn thành."
                    : "Đã thu hồi và lưu trữ công việc theo xác nhận của lãnh đạo.",
            before: { status: task.status, archivedAt: null },
            after: { status: task.status, archivedAt: nowIso },
            createdAt: nowIso,
        });
        if (mode === "cancel") {
            db.fileLinks = db.fileLinks.filter(
                (link) =>
                    !(
                        (link.entityType === "TASK" && link.entityId === taskId) ||
                        (link.entityType === "SUBMISSION" &&
                            submissionIds.has(link.entityId)) ||
                        (link.entityType === "COMMENT" &&
                            commentIds.has(link.entityId))
                    ),
            );
            const stillLinkedFileIds = new Set(
                db.fileLinks.map((link) => link.fileId),
            );
            db.files = db.files.map((file) =>
                fileIds.has(file.id) && !stillLinkedFileIds.has(file.id)
                    ? { ...file, status: "REMOVED" }
                    : file,
            );
        }

        if (task.status !== "DRAFT") {
            for (const recipientId of recipientIds) {
                db.notifications.push({
                    id: `n_${Date.now()}_${recipientId}_withdrawn`,
                    recipientId,
                    type: "TASK_UPDATED",
                    title:
                        mode === "finish"
                            ? "Công việc đã được lưu trữ"
                            : "Công việc đã được thu hồi",
                    body:
                        mode === "finish"
                            ? `[${task.code}] ${task.title} đã được Trưởng phòng lưu trữ sau khi duyệt hoàn thành.`
                            : `[${task.code}] ${task.title} đã được thu hồi theo xác nhận của lãnh đạo.`,
                    entityType: "TASK",
                    entityId: "",
                    createdAt: nowIso,
                    readAt: null,
                });
            }
        }

        this.persist();
        this.notify();
    }

    public async finishTask(taskId: Id, actorId: Id): Promise<void> {
        return this.cancelTask(taskId, actorId, "finish");
    }

    public async archiveTask(taskId: Id, actorId: Id): Promise<void> {
        return this.cancelTask(taskId, actorId, "finish");
    }

    public async reopenTask(
        taskId: Id,
        reason: string,
        actorId: Id,
    ): Promise<Task> {
        await this.delay();
        this.checkFailure();
        const trimmedReason = reason.trim();
        if (!trimmedReason) {
            throw new DomainError(
                "VALIDATION",
                "Bắt buộc nhập lý do mở lại công việc đã hoàn thành",
            );
        }

        const db = this.getDb();
        const taskIdx = db.tasks.findIndex((t) => t.id === taskId);
        if (taskIdx === -1)
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");

        const task = db.tasks[taskIdx];
        if (task.status !== "DONE") {
            throw new DomainError(
                "CONFLICT",
                "Chỉ có thể mở lại nhiệm vụ đã hoàn thành (DONE)",
            );
        }

        const nowIso = toIsoUtc();
        const updated: Task = {
            ...task,
            status: "IN_PROGRESS",
            completedAt: null,
            approvedById: null,
            approvedAt: null,
            updatedAt: nowIso,
        };
        db.tasks[taskIdx] = updated;

        db.events.push({
            id: `e_${Date.now()}_reopen`,
            taskId,
            actorId,
            kind: "REOPENED",
            note: `Mở lại công việc. Lý do: ${trimmedReason}`,
            before: { status: "DONE" },
            after: { status: "IN_PROGRESS" },
            createdAt: nowIso,
        });

        if (task.primaryAssigneeId && task.primaryAssigneeId !== actorId) {
            db.notifications.push({
                id: `n_${Date.now()}_reopen`,
                recipientId: task.primaryAssigneeId,
                type: "TASK_UPDATED",
                title: "Công việc đã được mở lại",
                body: `Nhiệm vụ [${task.code}] đã được Trưởng phòng mở lại để tiếp tục thực hiện. Lý do: ${trimmedReason}`,
                entityType: "TASK",
                entityId: taskId,
                createdAt: nowIso,
                readAt: null,
            });
        }

        this.persist();
        this.notify();
        return { ...updated };
    }

    public async convertTeamToOfficial(
        taskId: Id,
        data: { primaryAssigneeId: Id; dueAt: string; priority?: TaskPriority },
        actorId: Id,
    ): Promise<Task> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const idx = db.tasks.findIndex((t) => t.id === taskId);
        if (idx === -1)
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");

        const task = db.tasks[idx];
        if (task.type !== "TEAM") {
            throw new DomainError(
                "CONFLICT",
                "Chỉ công việc nhóm (TEAM) mới có thể chuyển đổi thành nhiệm vụ chính thức",
            );
        }

        const now = new Date();
        const nowIso = toIsoUtc(now);
        const count = db.tasks.length + 1;
        const year = new Intl.DateTimeFormat("en-US", {
            year: "numeric",
            timeZone: "Asia/Ho_Chi_Minh",
        }).format(now);
        const oldCode = task.code;
        const newCode = `CV-${year}-${String(count).padStart(4, "0")}`;

        const updated: Task = {
            ...task,
            code: newCode,
            type: "OFFICIAL",
            primaryAssigneeId: data.primaryAssigneeId,
            dueAt: data.dueAt,
            priority: data.priority || task.priority,
            status: task.status === "DRAFT" ? "TODO" : task.status,
            assignedAt: task.assignedAt || nowIso,
            updatedAt: nowIso,
        };

        db.tasks[idx] = updated;

        db.events.push({
            id: `e_${Date.now()}_type`,
            taskId,
            actorId,
            kind: "TYPE_CHANGED",
            note: `Trưởng phòng nâng cấp việc nhóm [${oldCode}] thành nhiệm vụ chính thức [${newCode}]`,
            before: {
                type: "TEAM",
                code: oldCode,
                primaryAssigneeId: task.primaryAssigneeId,
            },
            after: {
                type: "OFFICIAL",
                code: newCode,
                primaryAssigneeId: data.primaryAssigneeId,
                dueAt: data.dueAt,
            },
            createdAt: nowIso,
        });

        // Notify new assignee
        if (data.primaryAssigneeId !== actorId) {
            db.notifications.push({
                id: `n_${Date.now()}_conv`,
                recipientId: data.primaryAssigneeId,
                type: "TASK_ASSIGNED",
                title: "Nhiệm vụ chính thức mới (chuyển từ việc nhóm)",
                body: `Việc nhóm [${oldCode}] đã được nâng cấp thành nhiệm vụ chính thức [${newCode}]: ${task.title}`,
                entityType: "TASK",
                entityId: taskId,
                createdAt: nowIso,
                readAt: null,
            });
        }

        this.persist();
        this.notify();
        return { ...updated };
    }

    public async createSubtask(
        parentTaskId: Id,
        input: {
            title: string;
            primaryAssigneeId: Id;
            dueAt: string | null;
            priority?: TaskPriority;
            deliverable?: string;
        },
        actorId: Id,
    ): Promise<Task> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const parent = db.tasks.find((t) => t.id === parentTaskId);
        if (!parent)
            throw new DomainError("NOT_FOUND", "Không tìm thấy nhiệm vụ cha");

        // Check max 2 levels of subtasks
        if (parent.parentTaskId) {
            const grandparent = db.tasks.find(
                (t) => t.id === parent.parentTaskId,
            );
            if (grandparent && grandparent.parentTaskId) {
                throw new DomainError(
                    "VALIDATION",
                    "Hệ thống chỉ hỗ trợ tối đa 2 cấp việc con",
                );
            }
        }

        const now = new Date();
        const nowIso = toIsoUtc(now);
        const count = db.tasks.length + 1;
        const subCode = `${parent.code}.${String(count).slice(-2)}`;
        const newTaskId = `t${String(count).padStart(2, "0")}`;

        const newSubtask: Task = {
            id: newTaskId,
            code: subCode,
            type: parent.type,
            title: input.title.trim(),
            description: "",
            deliverable: input.deliverable?.trim() || "",
            status: "TODO",
            priority: input.priority || "NORMAL",
            progressPercent: 0,
            createdById: actorId,
            primaryAssigneeId: input.primaryAssigneeId,
            projectId: parent.projectId,
            parentTaskId: parent.id,
            assignedAt: nowIso,
            dueAt: input.dueAt,
            completedAt: null,
            approvedById: null,
            approvedAt: null,
            isBlocked: false,
            blockedReason: null,
            createdAt: nowIso,
            updatedAt: nowIso,
            archivedAt: null,
        };

        db.tasks.push(newSubtask);

        db.events.push({
            id: `e_${Date.now()}_sub`,
            taskId: parent.id,
            actorId,
            kind: "CREATED",
            note: `Tạo việc con [${subCode}] ${newSubtask.title}`,
            before: null,
            after: { subtaskId: newTaskId, subCode },
            createdAt: nowIso,
        });

        if (input.primaryAssigneeId !== actorId) {
            db.notifications.push({
                id: `n_${Date.now()}_sub`,
                recipientId: input.primaryAssigneeId,
                type: "TASK_ASSIGNED",
                title: "Bạn được giao việc con mới",
                body: `Việc con [${subCode}] ${newSubtask.title} (thuộc [${parent.code}])`,
                entityType: "TASK",
                entityId: newTaskId,
                createdAt: nowIso,
                readAt: null,
            });
        }

        this.persist();
        this.notify();
        return { ...newSubtask };
    }

    public async updateTask(
        id: Id,
        input: UpdateTaskInput,
        actorId: Id,
    ): Promise<Task> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const idx = db.tasks.findIndex((t) => t.id === id);
        if (idx === -1) {
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");
        }

        const task = db.tasks[idx];
        const nowIso = toIsoUtc();
        const updated: Task = {
            ...task,
            ...(input.title !== undefined ? { title: input.title.trim() } : {}),
            ...(input.description !== undefined
                ? { description: input.description.trim() }
                : {}),
            ...(input.deliverable !== undefined
                ? { deliverable: input.deliverable.trim() }
                : {}),
            ...(input.priority !== undefined
                ? { priority: input.priority }
                : {}),
            ...(input.projectId !== undefined
                ? { projectId: input.projectId }
                : {}),
            updatedAt: nowIso,
        };

        db.tasks[idx] = updated;

        db.events.push({
            id: `e_${Date.now()}`,
            taskId: id,
            actorId,
            kind: "PROGRESS_UPDATED",
            note: "Cập nhật thông tin công việc",
            before: { title: task.title, priority: task.priority },
            after: { title: updated.title, priority: updated.priority },
            createdAt: nowIso,
        });

        this.persist();
        this.notify();
        return { ...updated };
    }

    public async updateTaskProgress(
        id: Id,
        input: ProgressInput,
        actorId: Id,
    ): Promise<Task> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const idx = db.tasks.findIndex((t) => t.id === id);
        if (idx === -1) {
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");
        }

        const task = db.tasks[idx];
        const nowIso = toIsoUtc();

        if (
            input.isBlocked &&
            (!input.blockedReason || !input.blockedReason.trim())
        ) {
            throw new DomainError(
                "VALIDATION",
                "Bắt buộc nhập lý do vướng mắc khi đánh dấu cờ vướng mắc",
            );
        }

        let newStatus = task.status;
        if (task.status === "TODO" && input.progressPercent > 0) {
            newStatus = "IN_PROGRESS";
        }

        const updated: Task = {
            ...task,
            status: newStatus,
            progressPercent: Math.min(100, Math.max(0, input.progressPercent)),
            isBlocked: input.isBlocked,
            blockedReason:
                input.isBlocked && input.blockedReason
                    ? input.blockedReason.trim()
                    : null,
            updatedAt: nowIso,
        };

        db.tasks[idx] = updated;

        if (task.isBlocked !== updated.isBlocked) {
            db.events.push({
                id: `e_${Date.now()}_b`,
                taskId: id,
                actorId,
                kind: updated.isBlocked ? "BLOCKED" : "UNBLOCKED",
                note: updated.isBlocked
                    ? `Báo vướng mắc: ${input.blockedReason || "Không có lý do chi tiết"}`
                    : "Gỡ bỏ trạng thái vướng mắc",
                before: { isBlocked: task.isBlocked },
                after: { isBlocked: updated.isBlocked },
                createdAt: nowIso,
            });

            if (updated.isBlocked) {
                const leaders = db.users.filter(
                    (u) =>
                        (u.role === "MANAGER" || u.role === "DEPUTY_MANAGER") &&
                        u.status === "ACTIVE" &&
                        u.id !== actorId,
                );
                leaders.forEach((ldr) => {
                    db.notifications.push({
                        id: `n_${Date.now()}_blocked_${ldr.id}`,
                        recipientId: ldr.id,
                        type: "TASK_UPDATED",
                        title: "Báo cáo vướng mắc công việc",
                        body: `Chủ trì đã báo vướng mắc trên [${task.code}] ${task.title}: "${input.blockedReason}"`,
                        entityType: "TASK",
                        entityId: id,
                        createdAt: nowIso,
                        readAt: null,
                    });
                });
            }
        }

        db.events.push({
            id: `e_${Date.now()}`,
            taskId: id,
            actorId,
            kind: "PROGRESS_UPDATED",
            note: `Cập nhật tiến độ thành ${updated.progressPercent}%`,
            before: {
                progressPercent: task.progressPercent,
                status: task.status,
            },
            after: {
                progressPercent: updated.progressPercent,
                status: updated.status,
            },
            createdAt: nowIso,
        });

        this.persist();
        this.notify();
        return { ...updated };
    }

    public async changeTaskStatus(
        id: Id,
        newStatus: TaskStatus,
        actorId: Id,
        note?: string,
    ): Promise<Task> {
        if (newStatus === "CANCELLED") {
            const task = this.getDb().tasks.find((item) => item.id === id);
            if (!task)
                throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");
            await this.cancelTask(id, actorId);
            // Keep the legacy return type; cancellation removes the task from mock storage.
            return { ...task, status: "CANCELLED" };
        }
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const idx = db.tasks.findIndex((t) => t.id === id);
        if (idx === -1) {
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");
        }

        const task = db.tasks[idx];
        const nowIso = toIsoUtc();

        const updated: Task = {
            ...task,
            status: newStatus,
            completedAt: newStatus === "DONE" ? nowIso : task.completedAt,
            updatedAt: nowIso,
        };

        db.tasks[idx] = updated;

        const kind =
            newStatus === "IN_PROGRESS" ? "STARTED" : "PROGRESS_UPDATED";

        db.events.push({
            id: `e_${Date.now()}`,
            taskId: id,
            actorId,
            kind,
            note: note || `Chuyển trạng thái sang ${newStatus}`,
            before: { status: task.status },
            after: { status: newStatus },
            createdAt: nowIso,
        });

        this.persist();
        this.notify();
        return { ...updated };
    }

    public async deletePersonalTask(id: Id, actorId: Id): Promise<void> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const idx = db.tasks.findIndex((t) => t.id === id);
        if (idx === -1) {
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");
        }
        const task = db.tasks[idx];
        if (task.type !== "PERSONAL") {
            throw new DomainError(
                "FORBIDDEN",
                "Chỉ có thể xóa công việc cá nhân",
            );
        }
        if (task.createdById !== actorId) {
            throw new DomainError(
                "FORBIDDEN",
                "Bạn không có quyền xóa công việc cá nhân này",
            );
        }
        db.tasks.splice(idx, 1);
        db.participants = db.participants.filter((p) => p.taskId !== id);
        db.events = db.events.filter((e) => e.taskId !== id);
        this.persist();
        this.notify();
    }

    // --- Participants ---

    public async getParticipants(taskId?: Id): Promise<TaskParticipant[]> {
        await this.delay();
        this.checkFailure();
        const all = this.getDb().participants;
        if (taskId) {
            return all
                .filter((p) => p.taskId === taskId)
                .map((p) => ({ ...p }));
        }
        return all.map((p) => ({ ...p }));
    }

    public async addParticipant(
        data: { taskId: Id; userId: Id; role: ParticipantRole },
        _actorId: Id,
    ): Promise<TaskParticipant> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const existing = db.participants.find(
            (p) => p.taskId === data.taskId && p.userId === data.userId,
        );
        if (existing) {
            throw new DomainError(
                "CONFLICT",
                "Người dùng đã được gán vào công việc này",
            );
        }

        const nowIso = toIsoUtc();
        const newParticipant: TaskParticipant = {
            id: `tp_${Date.now()}`,
            taskId: data.taskId,
            userId: data.userId,
            role: data.role,
            invitationStatus: "PENDING",
            invitedAt: nowIso,
            respondedAt: null,
        };

        db.participants.push(newParticipant);

        db.notifications.push({
            id: `n_${Date.now()}`,
            recipientId: data.userId,
            type: "TEAM_INVITED",
            title: "Lời mời tham gia công việc",
            body: `Bạn được mời tham gia phối hợp công việc`,
            entityType: "TASK",
            entityId: data.taskId,
            createdAt: nowIso,
            readAt: null,
        });

        this.persist();
        this.notify();
        return { ...newParticipant };
    }

    public async respondInvitation(
        participantId: Id,
        decision: "ACCEPTED" | "DECLINED",
        actorId: Id,
    ): Promise<TaskParticipant> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const idx = db.participants.findIndex((p) => p.id === participantId);
        if (idx === -1) {
            throw new DomainError("NOT_FOUND", "Không tìm thấy lời mời");
        }

        const p = db.participants[idx];
        if (p.userId !== actorId) {
            throw new DomainError(
                "FORBIDDEN",
                "Bạn không có quyền phản hồi lời mời này",
            );
        }

        const nowIso = toIsoUtc();
        const updated: TaskParticipant = {
            ...p,
            invitationStatus: decision,
            respondedAt: nowIso,
        };

        db.participants[idx] = updated;

        db.events.push({
            id: `e_${Date.now()}`,
            taskId: p.taskId,
            actorId,
            kind: "TEAM_INVITE_RESPONDED",
            note: `${decision === "ACCEPTED" ? "Đồng ý" : "Từ chối"} tham gia phối hợp`,
            before: { invitationStatus: p.invitationStatus },
            after: { invitationStatus: decision },
            createdAt: nowIso,
        });

        this.persist();
        this.notify();
        return { ...updated };
    }

    // --- Comments ---

    public async getComments(taskId: Id): Promise<TaskComment[]> {
        await this.delay();
        this.checkFailure();
        return this.getDb()
            .comments.filter((c) => c.taskId === taskId)
            .map((c) => ({ ...c }))
            .sort(
                (a, b) =>
                    new Date(a.createdAt).getTime() -
                    new Date(b.createdAt).getTime(),
            );
    }

    public async addComment(
        taskId: Id,
        body: string,
        authorId: Id,
    ): Promise<TaskComment> {
        await this.delay();
        this.checkFailure();
        const trimmed = body.trim();
        if (!trimmed) {
            throw new DomainError(
                "VALIDATION",
                "Nội dung bình luận không được để trống",
            );
        }

        const db = this.getDb();
        const nowIso = toIsoUtc();
        const newComment: TaskComment = {
            id: `c_${Date.now()}`,
            taskId,
            authorId,
            body: trimmed,
            createdAt: nowIso,
            editedAt: null,
        };

        db.comments.push(newComment);

        // Update task's updatedAt immediately
        const taskIdx = db.tasks.findIndex((t) => t.id === taskId);
        if (taskIdx !== -1) {
            const task = db.tasks[taskIdx];
            db.tasks[taskIdx] = {
                ...task,
                updatedAt: nowIso,
            };

            // Notify other participants and primary assignee
            const author = db.users.find((u) => u.id === authorId);
            const recipientIds = new Set<string>();
            if (task.primaryAssigneeId && task.primaryAssigneeId !== authorId) {
                recipientIds.add(task.primaryAssigneeId);
            }
            if (task.createdById && task.createdById !== authorId) {
                recipientIds.add(task.createdById);
            }
            db.participants
                .filter(
                    (p) =>
                        p.taskId === taskId &&
                        p.userId !== authorId &&
                        p.invitationStatus === "ACCEPTED",
                )
                .forEach((p) => recipientIds.add(p.userId));

            recipientIds.forEach((recipientId) => {
                db.notifications.push({
                    id: `n_${Date.now()}_${recipientId}`,
                    recipientId,
                    type: "COMMENT_ADDED",
                    title: "Bình luận mới trên công việc",
                    body: `${author?.displayName || "Đồng nghiệp"} đã bình luận về [${task.code}] ${task.title}: "${trimmed.slice(0, 50)}${trimmed.length > 50 ? "..." : ""}"`,
                    entityType: "TASK",
                    entityId: taskId,
                    createdAt: nowIso,
                    readAt: null,
                });
            });
        }

        this.persist();
        this.notify();
        return { ...newComment };
    }

    // --- Submissions & Approvals ---

    public async getSubmissions(taskId?: Id): Promise<TaskSubmission[]> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const subs = taskId
            ? db.submissions.filter((s) => s.taskId === taskId)
            : db.submissions;
        return subs
            .map((s) => ({ ...s }))
            .sort(
                (a, b) =>
                    new Date(b.submittedAt).getTime() -
                    new Date(a.submittedAt).getTime(),
            );
    }

    public async addSubmission(
        taskId: Id,
        input: SubmitTaskInput,
        submittedById: Id,
    ): Promise<TaskSubmission> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const taskIdx = db.tasks.findIndex((t) => t.id === taskId);
        if (taskIdx === -1) {
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");
        }

        const task = db.tasks[taskIdx];
        if (task.status !== "IN_PROGRESS") {
            throw new DomainError(
                "CONFLICT",
                "Chỉ có thể nộp báo cáo kết quả khi công việc đang ở trạng thái Đang làm (IN_PROGRESS)",
            );
        }

        const trimmedSummary = input.summary.trim();
        if (!trimmedSummary) {
            throw new DomainError(
                "VALIDATION",
                "Bắt buộc nhập tóm tắt kết quả công việc để nộp duyệt",
            );
        }

        const nowIso = toIsoUtc();

        const submission: TaskSubmission = {
            id: `s_${Date.now()}`,
            taskId,
            submittedById,
            summary: trimmedSummary,
            details: input.details?.trim() || null,
            deliverableUrl: input.deliverableUrl?.trim() || null,
            notes: input.notes?.trim() || null,
            fileIds: input.fileIds || [],
            submittedAt: nowIso,
            status: "PENDING",
        };

        db.submissions.push(submission);

        // Link files if any
        (input.fileIds || []).forEach((fileId) => {
            db.fileLinks.push({
                id: `fl_${Date.now()}_sub_${fileId}`,
                fileId,
                entityType: "SUBMISSION",
                entityId: submission.id,
            });
            // Also link to task so it appears under Task Files tab
            const alreadyLinked = db.fileLinks.some(
                (fl) =>
                    fl.fileId === fileId &&
                    fl.entityType === "TASK" &&
                    fl.entityId === taskId,
            );
            if (!alreadyLinked) {
                db.fileLinks.push({
                    id: `fl_${Date.now()}_task_${fileId}`,
                    fileId,
                    entityType: "TASK",
                    entityId: taskId,
                });
            }
        });

        // Update task to IN_REVIEW
        db.tasks[taskIdx] = {
            ...task,
            status: "IN_REVIEW",
            progressPercent: 100,
            updatedAt: nowIso,
        };

        db.events.push({
            id: `e_${Date.now()}`,
            taskId,
            actorId: submittedById,
            kind: "SUBMITTED",
            note: `Nộp kết quả công việc: ${trimmedSummary.slice(0, 50)}...`,
            before: { status: task.status },
            after: { status: "IN_REVIEW" },
            createdAt: nowIso,
        });

        // Notify leaders (Manager and Deputy)
        const leaders = db.users.filter(
            (u) =>
                (u.role === "MANAGER" || u.role === "DEPUTY_MANAGER") &&
                u.status === "ACTIVE" &&
                u.id !== submittedById,
        );
        leaders.forEach((ldr) => {
            db.notifications.push({
                id: `n_${Date.now()}_sub_${ldr.id}`,
                recipientId: ldr.id,
                type: "SUBMISSION_RECEIVED",
                title: "Có kết quả cần duyệt",
                body: `Công việc [${task.code}] "${task.title}" đã được nộp kết quả.`,
                entityType: "TASK",
                entityId: taskId,
                createdAt: nowIso,
                readAt: null,
            });
        });

        this.persist();
        this.notify();
        return { ...submission };
    }

    public async getApprovals(taskId?: Id): Promise<TaskApproval[]> {
        await this.delay();
        this.checkFailure();
        const all = this.getDb().approvals;
        if (taskId) {
            return all
                .filter((a) => a.taskId === taskId)
                .map((a) => ({ ...a }));
        }
        return all.map((a) => ({ ...a }));
    }

    public async decideApproval(
        submissionId: Id,
        decision: ApprovalDecision,
        reason: string | null,
        decidedById: Id,
    ): Promise<TaskApproval> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const sub = db.submissions.find((s) => s.id === submissionId);
        if (!sub) {
            throw new DomainError("NOT_FOUND", "Không tìm thấy kết quả nộp");
        }

        const taskIdx = db.tasks.findIndex((t) => t.id === sub.taskId);
        if (taskIdx === -1) {
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");
        }

        const task = db.tasks[taskIdx];
        if (task.status !== "IN_REVIEW") {
            throw new DomainError(
                "CONFLICT",
                "Công việc không ở trạng thái Chờ duyệt (IN_REVIEW). Trạng thái có thể đã bị thay đổi.",
            );
        }

        const nowIso = toIsoUtc();

        if (decision === "RETURNED" && (!reason || !reason.trim())) {
            throw new DomainError(
                "VALIDATION",
                "Bắt buộc nhập lý do trả lại kết quả để chuyên viên hoàn thiện",
            );
        }

        const approval: TaskApproval = {
            id: `a_${Date.now()}`,
            taskId: task.id,
            submissionId,
            decidedById,
            decision,
            reason: reason?.trim() || null,
            decidedAt: nowIso,
        };

        db.approvals.push(approval);
        sub.status = decision;

        if (decision === "APPROVED") {
            db.tasks[taskIdx] = {
                ...task,
                status: "DONE",
                progressPercent: 100,
                completedAt: nowIso,
                approvedById: decidedById,
                approvedAt: nowIso,
                updatedAt: nowIso,
            };

            db.events.push({
                id: `e_${Date.now()}`,
                taskId: task.id,
                actorId: decidedById,
                kind: "APPROVED",
                note: reason
                    ? `Đã duyệt: ${reason}`
                    : "Đã duyệt kết quả công việc",
                before: { status: task.status },
                after: { status: "DONE" },
                createdAt: nowIso,
            });

            if (task.primaryAssigneeId) {
                db.notifications.push({
                    id: `n_${Date.now()}`,
                    recipientId: task.primaryAssigneeId,
                    type: "SUBMISSION_APPROVED",
                    title: "Kết quả đã được duyệt hoàn thành",
                    body: `Công việc [${task.code}] "${task.title}" đã được Trưởng phòng duyệt hoàn thành.`,
                    entityType: "TASK",
                    entityId: task.id,
                    createdAt: nowIso,
                    readAt: null,
                });
            }
        } else {
            // RETURNED
            db.tasks[taskIdx] = {
                ...task,
                status: "IN_PROGRESS",
                updatedAt: nowIso,
            };

            db.events.push({
                id: `e_${Date.now()}`,
                taskId: task.id,
                actorId: decidedById,
                kind: "RETURNED",
                note: `Trả lại kết quả: ${reason}`,
                before: { status: task.status },
                after: { status: "IN_PROGRESS" },
                createdAt: nowIso,
            });

            if (task.primaryAssigneeId) {
                db.notifications.push({
                    id: `n_${Date.now()}`,
                    recipientId: task.primaryAssigneeId,
                    type: "SUBMISSION_RETURNED",
                    title: "Kết quả bị trả lại yêu cầu bổ sung",
                    body: `Nhiệm vụ [${task.code}] bị trả lại. Lý do: ${reason}`,
                    entityType: "TASK",
                    entityId: task.id,
                    createdAt: nowIso,
                    readAt: null,
                });
            }
        }

        this.persist();
        this.notify();
        return { ...approval };
    }

    public async withdrawSubmission(
        taskId: Id,
        actorId: Id,
        reason?: string | null,
    ): Promise<Task> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const taskIdx = db.tasks.findIndex((t) => t.id === taskId);
        if (taskIdx === -1) {
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");
        }

        const task = db.tasks[taskIdx];
        if (task.status !== "IN_REVIEW") {
            throw new DomainError(
                "CONFLICT",
                "Chỉ có thể thu hồi báo cáo khi công việc đang ở trạng thái Chờ duyệt (IN_REVIEW)",
            );
        }

        // Validate actor is primary assignee or creator
        if (
            task.primaryAssigneeId !== actorId &&
            task.createdById !== actorId
        ) {
            throw new DomainError(
                "FORBIDDEN",
                "Chỉ chuyên viên thực hiện công việc mới có quyền thu hồi báo cáo",
            );
        }

        // Find the latest submission for this task
        const taskSubmissions = db.submissions.filter(
            (s) => s.taskId === taskId,
        );
        if (taskSubmissions.length === 0) {
            throw new DomainError(
                "NOT_FOUND",
                "Không tìm thấy báo cáo kết quả để thu hồi",
            );
        }
        const latestSub = taskSubmissions[taskSubmissions.length - 1];

        // Ensure no approval decision has been made for this submission
        const hasApproval = db.approvals.some(
            (a) => a.submissionId === latestSub.id,
        );
        if (hasApproval) {
            throw new DomainError(
                "CONFLICT",
                "Báo cáo đã được lãnh đạo xử lý hoặc phê duyệt, không thể thu hồi",
            );
        }

        const nowIso = toIsoUtc();
        const trimmedReason = reason?.trim() || null;

        latestSub.status = "WITHDRAWN";
        latestSub.withdrawnAt = nowIso;
        latestSub.withdrawnReason = trimmedReason;

        // Revert task back to IN_PROGRESS
        db.tasks[taskIdx] = {
            ...task,
            status: "IN_PROGRESS",
            progressPercent:
                task.progressPercent === 100 ? 90 : task.progressPercent,
            updatedAt: nowIso,
        };

        db.events.push({
            id: `e_${Date.now()}`,
            taskId,
            actorId,
            kind: "SUBMISSION_WITHDRAWN",
            note: trimmedReason
                ? `Thu hồi báo cáo kết quả: ${trimmedReason}`
                : "Thu hồi báo cáo kết quả chờ duyệt để chỉnh sửa, hoàn thiện",
            before: { status: "IN_REVIEW" },
            after: { status: "IN_PROGRESS" },
            createdAt: nowIso,
        });

        // Notify leaders (Manager and Deputy)
        const leaders = db.users.filter(
            (u) =>
                (u.role === "MANAGER" || u.role === "DEPUTY_MANAGER") &&
                u.status === "ACTIVE" &&
                u.id !== actorId,
        );
        leaders.forEach((ldr) => {
            db.notifications.push({
                id: `n_${Date.now()}_withdrawn_${ldr.id}`,
                recipientId: ldr.id,
                type: "SUBMISSION_WITHDRAWN",
                title: "Báo cáo công việc đã được thu hồi",
                body: `Chuyên viên đã thu hồi báo cáo công việc [${task.code}] "${task.title}"${trimmedReason ? `: ${trimmedReason}` : ""}.`,
                entityType: "TASK",
                entityId: taskId,
                createdAt: nowIso,
                readAt: null,
            });
        });

        this.persist();
        this.notify();
        return { ...db.tasks[taskIdx] };
    }

    // --- Deadline Requests ---

    public async getDeadlineRequests(
        taskId?: Id,
    ): Promise<TaskDeadlineRequest[]> {
        await this.delay();
        this.checkFailure();
        const all = this.getDb().deadlineRequests;
        if (taskId) {
            return all
                .filter((r) => r.taskId === taskId)
                .map((r) => ({ ...r }));
        }
        return all.map((r) => ({ ...r }));
    }

    public async createDeadlineRequest(
        taskId: Id,
        input: CreateDeadlineRequestInput,
        requestedById: Id,
    ): Promise<TaskDeadlineRequest> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const task = db.tasks.find((t) => t.id === taskId);
        if (!task)
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");

        if (
            task.dueAt &&
            new Date(input.proposedDueAt).getTime() <=
                new Date(task.dueAt).getTime()
        ) {
            throw new DomainError(
                "VALIDATION",
                "Thời hạn đề xuất phải lớn hơn thời hạn hiện tại của công việc",
            );
        }

        const trimmedReason = input.reason.trim();
        if (!trimmedReason) {
            throw new DomainError(
                "VALIDATION",
                "Bắt buộc nhập lý do đề nghị gia hạn",
            );
        }

        const nowIso = toIsoUtc();
        const req: TaskDeadlineRequest = {
            id: `dr_${Date.now()}`,
            taskId,
            requestedById,
            proposedDueAt: input.proposedDueAt,
            reason: trimmedReason,
            status: "PENDING",
            decidedById: null,
            decidedAt: null,
            decisionReason: null,
            createdAt: nowIso,
        };

        db.deadlineRequests.push(req);

        db.events.push({
            id: `e_${Date.now()}`,
            taskId,
            actorId: requestedById,
            kind: "DEADLINE_REQUESTED",
            note: `Đề nghị gia hạn hạn nộp: ${trimmedReason}`,
            before: { dueAt: task.dueAt },
            after: { proposedDueAt: input.proposedDueAt },
            createdAt: nowIso,
        });

        // Notify Leaders
        const leaders = db.users.filter(
            (u) =>
                (u.role === "MANAGER" || u.role === "DEPUTY_MANAGER") &&
                u.status === "ACTIVE" &&
                u.id !== requestedById,
        );
        leaders.forEach((ldr) => {
            db.notifications.push({
                id: `n_${Date.now()}_dr_${ldr.id}`,
                recipientId: ldr.id,
                type: "DEADLINE_REQUESTED",
                title: "Đề nghị gia hạn nhiệm vụ",
                body: `Chuyên viên đề xuất lùi hạn công việc [${task.code}] đến ${input.proposedDueAt}. Lý do: ${trimmedReason}`,
                entityType: "TASK",
                entityId: taskId,
                createdAt: nowIso,
                readAt: null,
            });
        });

        this.persist();
        this.notify();
        return { ...req };
    }

    public async decideDeadlineRequest(
        requestId: Id,
        input: DecisionInput,
        decidedById: Id,
    ): Promise<TaskDeadlineRequest> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const reqIdx = db.deadlineRequests.findIndex((r) => r.id === requestId);
        if (reqIdx === -1)
            throw new DomainError(
                "NOT_FOUND",
                "Không tìm thấy đề nghị gia hạn",
            );

        const req = db.deadlineRequests[reqIdx];
        if (req.status !== "PENDING") {
            throw new DomainError(
                "CONFLICT",
                "Đề nghị gia hạn này đã được xử lý trước đó",
            );
        }

        const taskIdx = db.tasks.findIndex((t) => t.id === req.taskId);
        const nowIso = toIsoUtc();

        const updatedReq: TaskDeadlineRequest = {
            ...req,
            status: input.decision,
            decidedById,
            decidedAt: nowIso,
            decisionReason: input.reason?.trim() || null,
        };

        db.deadlineRequests[reqIdx] = updatedReq;

        if (taskIdx !== -1) {
            const task = db.tasks[taskIdx];
            if (input.decision === "APPROVED") {
                db.tasks[taskIdx] = {
                    ...task,
                    dueAt: req.proposedDueAt,
                    updatedAt: nowIso,
                };

                db.events.push({
                    id: `e_${Date.now()}`,
                    taskId: task.id,
                    actorId: decidedById,
                    kind: "DEADLINE_CHANGED",
                    note: `Chấp thuận gia hạn thời hạn đến ${req.proposedDueAt}${input.reason ? `. Lý do: ${input.reason}` : ""}`,
                    before: { dueAt: task.dueAt },
                    after: { dueAt: req.proposedDueAt },
                    createdAt: nowIso,
                });

                // Notify requester
                db.notifications.push({
                    id: `n_${Date.now()}_dr_dec`,
                    recipientId: req.requestedById,
                    type: "REQUEST_DECIDED",
                    title: "Đề nghị gia hạn đã được phê duyệt",
                    body: `Thời hạn công việc [${task.code}] đã được điều chỉnh sang ${req.proposedDueAt}.`,
                    entityType: "TASK",
                    entityId: task.id,
                    createdAt: nowIso,
                    readAt: null,
                });
            } else {
                db.events.push({
                    id: `e_${Date.now()}`,
                    taskId: task.id,
                    actorId: decidedById,
                    kind: "DEADLINE_REQUEST_DECIDED",
                    note: `Từ chối đề nghị gia hạn: ${input.reason || "Không đạt yêu cầu"}`,
                    before: { status: "PENDING" },
                    after: { status: "REJECTED" },
                    createdAt: nowIso,
                });

                // Notify requester
                db.notifications.push({
                    id: `n_${Date.now()}_dr_dec`,
                    recipientId: req.requestedById,
                    type: "REQUEST_DECIDED",
                    title: "Đề nghị gia hạn đã bị từ chối",
                    body: `Đề nghị gia hạn cho công việc [${task.code}] đã bị từ chối. Lý do: ${input.reason || "Không đạt yêu cầu"}`,
                    entityType: "TASK",
                    entityId: task.id,
                    createdAt: nowIso,
                    readAt: null,
                });
            }
        }

        this.persist();
        this.notify();
        return { ...updatedReq };
    }

    // --- Assignee Requests ---

    public async transferTask(
        taskId: Id,
        input: { assigneeId: Id; note?: string },
        actorId: Id,
    ): Promise<Task> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const actor = db.users.find((user) => user.id === actorId);
        const taskIndex = db.tasks.findIndex((item) => item.id === taskId);
        const task = db.tasks[taskIndex];
        if (!task)
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");
        if (
            actor?.role !== "STAFF" ||
            task.primaryAssigneeId !== actorId ||
            (task.type !== "OFFICIAL" && task.type !== "TEAM")
        ) {
            throw new DomainError(
                "FORBIDDEN",
                "Chỉ chuyên viên đang nhận chính mới được chuyển xử lý",
            );
        }
        if (task.status !== "TODO" && task.status !== "IN_PROGRESS")
            throw new DomainError(
                "CONFLICT",
                "Chỉ có thể chuyển công việc đang thực hiện",
            );
        if (input.assigneeId === actorId)
            throw new DomainError("VALIDATION", "Hãy chọn chuyên viên khác");
        const target = db.users.find(
            (user) =>
                user.id === input.assigneeId &&
                user.role === "STAFF" &&
                user.status === "ACTIVE",
        );
        if (!target)
            throw new DomainError(
                "VALIDATION",
                "Chuyên viên nhận việc phải đang hoạt động",
            );

        const now = toIsoUtc();
        const note = input.note?.trim();
        const updated: Task = {
            ...task,
            primaryAssigneeId: target.id,
            assignedAt: now,
            updatedAt: now,
            version: (task.version ?? 1) + 1,
        };
        db.tasks[taskIndex] = updated;
        db.participants = db.participants.filter(
            (participant) =>
                participant.taskId !== taskId ||
                participant.userId !== target.id,
        );
        db.assigneeRequests = db.assigneeRequests.map((request) =>
            request.taskId === taskId && request.status === "PENDING"
                ? {
                      ...request,
                      status: "REJECTED",
                      decidedById: actorId,
                      decidedAt: now,
                      decisionReason:
                          "Nhiệm vụ đã được chuyển xử lý trực tiếp.",
                  }
                : request,
        );
        db.events.push({
            id: `e_${Date.now()}_transfer`,
            taskId,
            actorId,
            kind: "ASSIGNEE_CHANGED",
            note: note || `Chuyển xử lý cho ${target.displayName}.`,
            before: { primaryAssigneeId: actorId },
            after: { primaryAssigneeId: target.id },
            createdAt: now,
        });
        db.notifications.push({
            id: `n_${Date.now()}_transfer`,
            recipientId: target.id,
            type: "TASK_ASSIGNED",
            title: "Bạn được chuyển giao công việc",
            body: `[${task.code}] ${task.title} đã được chuyển cho bạn xử lý.${note ? ` Lời nhắn: ${note}` : ""}`,
            entityType: "TASK",
            entityId: taskId,
            createdAt: now,
            readAt: null,
        });
        if (task.createdById !== actorId && task.createdById !== target.id) {
            db.notifications.push({
                id: `n_${Date.now()}_transfer_creator`,
                recipientId: task.createdById,
                type: "TASK_UPDATED",
                title: "Công việc đã được chuyển xử lý",
                body: `[${task.code}] ${task.title} đã được chuyển cho ${target.displayName}.`,
                entityType: "TASK",
                entityId: taskId,
                createdAt: now,
                readAt: null,
            });
        }
        this.persist();
        this.notify();
        return { ...updated };
    }

    public async getAssigneeRequests(
        taskId?: Id,
    ): Promise<TaskAssigneeRequest[]> {
        await this.delay();
        this.checkFailure();
        const all = this.getDb().assigneeRequests;
        if (taskId) {
            return all
                .filter((r) => r.taskId === taskId)
                .map((r) => ({ ...r }));
        }
        return all.map((r) => ({ ...r }));
    }

    public async createAssigneeRequest(
        taskId: Id,
        input: CreateAssigneeRequestInput,
        requestedById: Id,
    ): Promise<TaskAssigneeRequest> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const task = db.tasks.find((t) => t.id === taskId);
        if (!task)
            throw new DomainError("NOT_FOUND", "Không tìm thấy công việc");

        if (input.proposedAssigneeId === task.primaryAssigneeId) {
            throw new DomainError(
                "VALIDATION",
                "Người được đề xuất phải khác với người đang chủ trì",
            );
        }

        const trimmedReason = input.reason.trim();
        if (!trimmedReason) {
            throw new DomainError(
                "VALIDATION",
                "Bắt buộc nhập lý do đề nghị chuyển người chủ trì",
            );
        }

        const nowIso = toIsoUtc();
        const req: TaskAssigneeRequest = {
            id: `ar_${Date.now()}`,
            taskId,
            requestedById,
            proposedAssigneeId: input.proposedAssigneeId,
            reason: trimmedReason,
            status: "PENDING",
            decidedById: null,
            decidedAt: null,
            decisionReason: null,
            createdAt: nowIso,
        };

        db.assigneeRequests.push(req);

        db.events.push({
            id: `e_${Date.now()}`,
            taskId,
            actorId: requestedById,
            kind: "ASSIGNEE_REQUESTED",
            note: `Đề nghị chuyển người XLC: ${trimmedReason}`,
            before: { primaryAssigneeId: task.primaryAssigneeId },
            after: { proposedAssigneeId: input.proposedAssigneeId },
            createdAt: nowIso,
        });

        // Notify Leaders
        const leaders = db.users.filter(
            (u) =>
                (u.role === "MANAGER" || u.role === "DEPUTY_MANAGER") &&
                u.status === "ACTIVE" &&
                u.id !== requestedById,
        );
        leaders.forEach((ldr) => {
            db.notifications.push({
                id: `n_${Date.now()}_ar_${ldr.id}`,
                recipientId: ldr.id,
                type: "ASSIGNEE_REQUESTED",
                title: "Đề nghị chuyển người chủ trì",
                body: `Chuyên viên đề xuất chuyển chủ trì công việc [${task.code}] cho người khác. Lý do: ${trimmedReason}`,
                entityType: "TASK",
                entityId: taskId,
                createdAt: nowIso,
                readAt: null,
            });
        });

        this.persist();
        this.notify();
        return { ...req };
    }

    public async decideAssigneeRequest(
        requestId: Id,
        input: DecisionInput,
        decidedById: Id,
    ): Promise<TaskAssigneeRequest> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const reqIdx = db.assigneeRequests.findIndex((r) => r.id === requestId);
        if (reqIdx === -1)
            throw new DomainError(
                "NOT_FOUND",
                "Không tìm thấy đề nghị chuyển người",
            );

        const req = db.assigneeRequests[reqIdx];
        if (req.status !== "PENDING") {
            throw new DomainError(
                "CONFLICT",
                "Đề nghị chuyển người chủ trì này đã được xử lý trước đó",
            );
        }

        const taskIdx = db.tasks.findIndex((t) => t.id === req.taskId);
        const nowIso = toIsoUtc();

        const updatedReq: TaskAssigneeRequest = {
            ...req,
            status: input.decision,
            decidedById,
            decidedAt: nowIso,
            decisionReason: input.reason?.trim() || null,
        };

        db.assigneeRequests[reqIdx] = updatedReq;

        if (taskIdx !== -1) {
            const task = db.tasks[taskIdx];
            const oldAssigneeId = task.primaryAssigneeId;

            if (input.decision === "APPROVED") {
                db.tasks[taskIdx] = {
                    ...task,
                    primaryAssigneeId: req.proposedAssigneeId,
                    updatedAt: nowIso,
                };

                db.events.push({
                    id: `e_${Date.now()}`,
                    taskId: task.id,
                    actorId: decidedById,
                    kind: "ASSIGNEE_CHANGED",
                    note: `Chấp thuận chuyển người chủ trì sang chuyên viên mới${input.reason ? `. Lý do: ${input.reason}` : ""}`,
                    before: { primaryAssigneeId: oldAssigneeId },
                    after: { primaryAssigneeId: req.proposedAssigneeId },
                    createdAt: nowIso,
                });

                // Notifications
                db.notifications.push({
                    id: `n_${Date.now()}_ar_req`,
                    recipientId: req.requestedById,
                    type: "REQUEST_DECIDED",
                    title: "Đề nghị đổi chủ trì đã được duyệt",
                    body: `Đề nghị chuyển chủ trì công việc [${task.code}] đã được chấp thuận.`,
                    entityType: "TASK",
                    entityId: task.id,
                    createdAt: nowIso,
                    readAt: null,
                });

                db.notifications.push({
                    id: `n_${Date.now()}_ar_new`,
                    recipientId: req.proposedAssigneeId,
                    type: "TASK_ASSIGNED",
                    title: "Bạn được giao làm chủ trì nhiệm vụ",
                    body: `Bạn được phân công làm chủ trì công việc [${task.code}] ${task.title}.`,
                    entityType: "TASK",
                    entityId: task.id,
                    createdAt: nowIso,
                    readAt: null,
                });

                if (oldAssigneeId && oldAssigneeId !== req.requestedById) {
                    db.notifications.push({
                        id: `n_${Date.now()}_ar_old`,
                        recipientId: oldAssigneeId,
                        type: "TASK_UPDATED",
                        title: "Thay đổi phân công chủ trì",
                        body: `Công việc [${task.code}] đã được chuyển giao cho người khác.`,
                        entityType: "TASK",
                        entityId: task.id,
                        createdAt: nowIso,
                        readAt: null,
                    });
                }
            } else {
                db.events.push({
                    id: `e_${Date.now()}`,
                    taskId: task.id,
                    actorId: decidedById,
                    kind: "ASSIGNEE_REQUEST_DECIDED",
                    note: `Từ chối đề nghị đổi người XLC: ${input.reason || "Không có lý do chi tiết"}`,
                    before: { status: "PENDING" },
                    after: { status: "REJECTED" },
                    createdAt: nowIso,
                });

                db.notifications.push({
                    id: `n_${Date.now()}_ar_rej`,
                    recipientId: req.requestedById,
                    type: "REQUEST_DECIDED",
                    title: "Đề nghị đổi chủ trì bị từ chối",
                    body: `Đề nghị chuyển chủ trì công việc [${task.code}] đã bị từ chối. Lý do: ${input.reason || "Không đạt yêu cầu"}`,
                    entityType: "TASK",
                    entityId: task.id,
                    createdAt: nowIso,
                    readAt: null,
                });
            }
        }

        this.persist();
        this.notify();
        return { ...updatedReq };
    }

    // --- Events ---

    public async getEvents(taskId?: Id): Promise<TaskEvent[]> {
        await this.delay();
        this.checkFailure();
        const all = this.getDb().events;
        if (taskId) {
            return all
                .filter((e) => e.taskId === taskId)
                .map((e) => ({ ...e }))
                .sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                );
        }
        return all.map((e) => ({ ...e }));
    }

    // --- Recurrence ---

    public async getRecurrenceRules(): Promise<RecurrenceRule[]> {
        await this.delay();
        this.checkFailure();
        return [...this.getDb().recurrenceRules];
    }

    public async getRecurrenceInstances(): Promise<RecurrenceInstance[]> {
        await this.delay();
        this.checkFailure();
        return [...this.getDb().recurrenceInstances];
    }

    public async createRecurrenceRule(
        input: Omit<RecurrenceRule, "id" | "createdAt">,
    ): Promise<RecurrenceRule> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const newRule: RecurrenceRule = {
            ...input,
            id: `rr_${String(db.recurrenceRules.length + 1).padStart(2, "0")}`,
            scope: input.scope || "ALL",
            assigneeIds: input.assigneeIds || [],
            createdAt: toIsoUtc(),
        };
        db.recurrenceRules.push(newRule);
        this.persist();
        this.notify();
        return { ...newRule };
    }

    public async updateRecurrenceRule(
        id: Id,
        updates: Partial<Omit<RecurrenceRule, "id" | "createdAt">>,
    ): Promise<RecurrenceRule> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const idx = db.recurrenceRules.findIndex((r) => r.id === id);
        if (idx === -1)
            throw new DomainError("NOT_FOUND", "Không tìm thấy mẫu định kỳ");

        const updated: RecurrenceRule = {
            ...db.recurrenceRules[idx],
            ...updates,
        };
        db.recurrenceRules[idx] = updated;
        this.persist();
        this.notify();
        return { ...updated };
    }

    public async deleteRecurrenceRule(id: Id): Promise<boolean> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const idx = db.recurrenceRules.findIndex((r) => r.id === id);
        if (idx === -1)
            throw new DomainError("NOT_FOUND", "Không tìm thấy mẫu định kỳ");

        db.recurrenceRules.splice(idx, 1);
        this.persist();
        this.notify();
        return true;
    }

    public async toggleRecurrenceRule(
        id: Id,
        active: boolean,
    ): Promise<RecurrenceRule> {
        return this.updateRecurrenceRule(id, { active });
    }

    public async generateRecurrenceNext(
        ruleId: Id,
        actorId: Id,
    ): Promise<{ task: Task; tasks: Task[]; instance: RecurrenceInstance }> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const rule = db.recurrenceRules.find((r) => r.id === ruleId);
        if (!rule)
            throw new DomainError("NOT_FOUND", "Không tìm thấy mẫu định kỳ");

        const nextDate = new Date(rule.nextRunAt || Date.now());
        const year = nextDate.getFullYear();
        const month = String(nextDate.getMonth() + 1).padStart(2, "0");
        const oneJan = new Date(nextDate.getFullYear(), 0, 1);
        const numberOfDays = Math.floor(
            (nextDate.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000),
        );
        const weekNumber = Math.ceil(
            (nextDate.getDay() + 1 + numberOfDays) / 7,
        );
        const periodKey =
            rule.frequency === "WEEKLY"
                ? `${year}-W${String(weekNumber).padStart(2, "0")}`
                : `${year}-${month}`;

        // Conflict check
        const existing = db.recurrenceInstances.find(
            (inst) => inst.ruleId === ruleId && inst.periodKey === periodKey,
        );
        if (existing) {
            throw new DomainError(
                "CONFLICT",
                `Nhiệm vụ cho kỳ [${periodKey}] đã được sinh trước đó (Mã liên kết: ${existing.taskId || existing.taskIds?.join(", ")}). Hệ thống không sinh trùng lặp.`,
            );
        }

        // Determine target assignees
        let targetUsers: User[] = [];
        if (rule.scope === "ALL") {
            // Assign to all active staff in the department
            targetUsers = db.users.filter(
                (u) => u.status === "ACTIVE" && u.role === "STAFF",
            );
            if (targetUsers.length === 0) {
                targetUsers = db.users.filter(
                    (u) => u.status === "ACTIVE" && u.id !== actorId,
                );
            }
        } else if (rule.assigneeIds && rule.assigneeIds.length > 0) {
            targetUsers = db.users.filter(
                (u) =>
                    rule.assigneeIds!.includes(u.id) && u.status === "ACTIVE",
            );
        }

        if (targetUsers.length === 0 && rule.primaryAssigneeId) {
            const fallbackUser = db.users.find(
                (u) => u.id === rule.primaryAssigneeId,
            );
            if (fallbackUser) targetUsers = [fallbackUser];
        }

        if (targetUsers.length === 0) {
            targetUsers = db.users.filter(
                (u) => u.status === "ACTIVE" && u.role === "STAFF",
            );
        }

        const now = new Date();
        const nowIso = toIsoUtc(now);
        const dueTime = new Date(
            now.getTime() + rule.dueAfterHours * 3600000,
        ).toISOString();
        const yearStr = new Intl.DateTimeFormat("en-US", {
            year: "numeric",
            timeZone: "Asia/Ho_Chi_Minh",
        }).format(now);

        const createdTasks: Task[] = [];

        for (const assignee of targetUsers) {
            const count = db.tasks.length + 1;
            const code = `CV-${yearStr}-${String(count).padStart(4, "0")}`;
            const newTaskId = `t${String(count).padStart(2, "0")}`;

            const newTask: Task = {
                id: newTaskId,
                code,
                type: "OFFICIAL",
                title: `${rule.title} - Kỳ ${periodKey}`,
                description: rule.description,
                deliverable: "Báo cáo định kỳ theo mẫu quy định.",
                status: "TODO",
                priority: rule.priority,
                progressPercent: 0,
                createdById: actorId,
                primaryAssigneeId: assignee.id,
                projectId: null,
                parentTaskId: null,
                assignedAt: nowIso,
                dueAt: dueTime,
                completedAt: null,
                approvedById: null,
                approvedAt: null,
                isBlocked: false,
                blockedReason: null,
                createdAt: nowIso,
                updatedAt: nowIso,
                archivedAt: null,
            };

            db.tasks.push(newTask);
            createdTasks.push(newTask);

            // Event
            db.events.push({
                id: `e_${Date.now()}_${newTaskId}_rec`,
                taskId: newTaskId,
                actorId,
                kind: "RECURRENCE_GENERATED",
                note: `Sinh nhiệm vụ định kỳ tự động từ mẫu [${rule.id}] cho kỳ ${periodKey} (Chủ trì: ${assignee.displayName})`,
                before: null,
                after: { ruleId, periodKey, assigneeId: assignee.id },
                createdAt: nowIso,
            });

            // Notification
            if (assignee.id !== actorId) {
                db.notifications.push({
                    id: `n_${Date.now()}_${newTaskId}_rec`,
                    recipientId: assignee.id,
                    type: "TASK_ASSIGNED",
                    title: "Nhiệm vụ định kỳ mới được phát hành",
                    body: `Nhiệm vụ: ${newTask.title} (${newTask.code})`,
                    entityType: "TASK",
                    entityId: newTaskId,
                    createdAt: nowIso,
                    readAt: null,
                });
            }
        }

        const newInstance: RecurrenceInstance = {
            id: `ri_${Date.now()}`,
            ruleId,
            periodKey,
            taskId: createdTasks[0]?.id || "",
            taskIds: createdTasks.map((t) => t.id),
            createdAt: nowIso,
        };

        db.recurrenceInstances.push(newInstance);

        // Advance rule nextRunAt
        const nextRun = new Date(
            nextDate.getTime() +
                (rule.frequency === "WEEKLY" ? 7 * 86400000 : 30 * 86400000),
        );
        rule.nextRunAt = nextRun.toISOString();

        this.persist();
        this.notify();
        return {
            task: createdTasks[0],
            tasks: createdTasks,
            instance: newInstance,
        };
    }

    public async submitRecurrenceReport(
        taskId: Id,
        input: SubmitTaskInput,
        submittedById: Id,
    ): Promise<TaskSubmission> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const task = db.tasks.find((t) => t.id === taskId);
        if (!task) {
            throw new DomainError(
                "NOT_FOUND",
                "Không tìm thấy nhiệm vụ định kỳ",
            );
        }
        if (task.status === "TODO") {
            task.status = "IN_PROGRESS";
            task.progressPercent = 50;
        }
        return this.addSubmission(taskId, input, submittedById);
    }

    // --- Notifications ---

    public async getNotifications(recipientId?: Id): Promise<Notification[]> {
        await this.delay();
        this.checkFailure();
        const all = this.getDb().notifications;
        if (recipientId) {
            return all
                .filter((n) => n.recipientId === recipientId)
                .map((n) => ({ ...n }))
                .sort(
                    (a, b) =>
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                );
        }
        return all.map((n) => ({ ...n }));
    }

    public async markNotificationAsRead(id: Id): Promise<Notification> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const idx = db.notifications.findIndex((n) => n.id === id);
        if (idx === -1)
            throw new DomainError("NOT_FOUND", "Không tìm thấy thông báo");

        const updated: Notification = {
            ...db.notifications[idx],
            readAt: toIsoUtc(),
        };
        db.notifications[idx] = updated;
        this.persist();
        this.notify();
        return { ...updated };
    }

    public async markAllNotificationsAsRead(recipientId: Id): Promise<void> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const nowIso = toIsoUtc();
        db.notifications.forEach((n) => {
            if (n.recipientId === recipientId && !n.readAt) {
                n.readAt = nowIso;
            }
        });
        this.persist();
        this.notify();
    }

    // --- Files & Links ---

    public async getFiles(): Promise<FileObject[]> {
        await this.delay();
        this.checkFailure();
        return [...this.getDb().files];
    }

    public async getFileById(id: Id): Promise<FileObject | null> {
        await this.delay();
        this.checkFailure();
        const file = this.getDb().files.find((f) => f.id === id);
        return file ? { ...file } : null;
    }

    public async uploadMockFile(
        data: { originalName: string; mimeType: string; sizeBytes: number },
        uploadedById: Id,
    ): Promise<FileObject> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const newFile: FileObject = {
            id: `f_${Date.now()}`,
            originalName: data.originalName,
            mimeType: data.mimeType,
            sizeBytes: data.sizeBytes,
            objectKey: null,
            uploadedById,
            createdAt: toIsoUtc(),
            status: "MOCK_LOCAL",
        };
        db.files.push(newFile);
        this.persist();
        this.notify();
        return { ...newFile };
    }

    public async getFileLinks(
        entityType?: FileLink["entityType"],
        entityId?: Id,
    ): Promise<FileLink[]> {
        await this.delay();
        this.checkFailure();
        let links = this.getDb().fileLinks;
        if (entityType) {
            links = links.filter((l) => l.entityType === entityType);
        }
        if (entityId) {
            links = links.filter((l) => l.entityId === entityId);
        }
        return links.map((l) => ({ ...l }));
    }

    public async createFileLink(
        fileId: Id,
        entityType: FileLink["entityType"],
        entityId: Id,
    ): Promise<FileLink> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const link: FileLink = {
            id: `fl_${Date.now()}`,
            fileId,
            entityType,
            entityId,
        };
        db.fileLinks.push(link);
        this.persist();
        this.notify();
        return { ...link };
    }

    public async deleteFile(fileId: Id, actorId: Id): Promise<void> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const idx = db.files.findIndex((f) => f.id === fileId);
        if (idx === -1)
            throw new DomainError("NOT_FOUND", "Không tìm thấy tệp đính kèm");

        const actor = db.users.find((u) => u.id === actorId);
        const file = db.files[idx];
        if (
            file.uploadedById !== actorId &&
            actor?.role !== "MANAGER" &&
            actor?.role !== "DEPUTY_MANAGER"
        ) {
            throw new DomainError(
                "FORBIDDEN",
                "Chỉ người tải lên hoặc Lãnh đạo phòng mới có quyền xóa tệp này",
            );
        }

        db.files.splice(idx, 1);
        db.fileLinks = db.fileLinks.filter((l) => l.fileId !== fileId);
        this.persist();
        this.notify();
    }

    public async unlinkFile(fileLinkId: Id, actorId: Id): Promise<void> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const linkIdx = db.fileLinks.findIndex((l) => l.id === fileLinkId);
        if (linkIdx === -1)
            throw new DomainError("NOT_FOUND", "Không tìm thấy liên kết tệp");

        const link = db.fileLinks[linkIdx];
        const file = db.files.find((f) => f.id === link.fileId);
        const actor = db.users.find((u) => u.id === actorId);
        if (
            file &&
            file.uploadedById !== actorId &&
            actor?.role !== "MANAGER" &&
            actor?.role !== "DEPUTY_MANAGER"
        ) {
            throw new DomainError(
                "FORBIDDEN",
                "Chỉ người tải lên hoặc Lãnh đạo phòng mới có quyền gỡ liên kết tệp",
            );
        }

        db.fileLinks.splice(linkIdx, 1);
        this.persist();
        this.notify();
    }

    // --- Chat ---

    public async getChatRooms(userId?: Id): Promise<ChatRoom[]> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        if (!userId) return [...db.chatRooms];

        const joinedRoomIds = new Set(
            db.chatMembers
                .filter((m) => m.userId === userId)
                .map((m) => m.roomId),
        );
        return db.chatRooms
            .filter((r) => joinedRoomIds.has(r.id))
            .map((r) => ({ ...r }));
    }

    public async getChatMembers(roomId: Id): Promise<ChatRoomMember[]> {
        await this.delay();
        this.checkFailure();
        return this.getDb()
            .chatMembers.filter((m) => m.roomId === roomId)
            .map((m) => ({ ...m }));
    }

    public async getChatMessages(roomId: Id): Promise<ChatMessage[]> {
        await this.delay();
        this.checkFailure();
        return this.getDb()
            .chatMessages.filter((m) => m.roomId === roomId && !m.deletedAt)
            .map((m) => ({ ...m }))
            .sort(
                (a, b) =>
                    new Date(a.createdAt).getTime() -
                    new Date(b.createdAt).getTime(),
            );
    }

    public async sendChatMessage(
        roomId: Id,
        body: string,
        senderId: Id,
    ): Promise<ChatMessage> {
        await this.delay();
        this.checkFailure();
        const trimmed = body.trim();
        if (!trimmed)
            throw new DomainError(
                "VALIDATION",
                "Nội dung tin nhắn không được trống",
            );

        const db = this.getDb();
        const isMember = db.chatMembers.some(
            (m) => m.roomId === roomId && m.userId === senderId,
        );
        if (!isMember) {
            throw new DomainError(
                "FORBIDDEN",
                "Bạn không phải thành viên của cuộc hội thoại này",
            );
        }

        const nowIso = toIsoUtc();
        const newMsg: ChatMessage = {
            id: `m_${Date.now()}`,
            roomId,
            senderId,
            body: trimmed,
            createdAt: nowIso,
            editedAt: null,
            deletedAt: null,
        };

        db.chatMessages.push(newMsg);

        // Update sender's lastReadAt
        const senderMember = db.chatMembers.find(
            (m) => m.roomId === roomId && m.userId === senderId,
        );
        if (senderMember) {
            senderMember.lastReadAt = nowIso;
        }

        // Notify other members
        const otherMembers = db.chatMembers.filter(
            (m) => m.roomId === roomId && m.userId !== senderId,
        );
        const sender = db.users.find((u) => u.id === senderId);
        otherMembers.forEach((m) => {
            db.notifications.push({
                id: `n_${Date.now()}_chat_${m.userId}`,
                recipientId: m.userId,
                type: "CHAT_MESSAGE",
                title: `Tin nhắn mới từ ${sender?.displayName || "Đồng nghiệp"}`,
                body:
                    trimmed.length > 60
                        ? `${trimmed.slice(0, 60)}...`
                        : trimmed,
                entityType: "CHAT",
                entityId: roomId,
                createdAt: nowIso,
                readAt: null,
            });
        });

        this.persist();
        this.notify();
        return { ...newMsg };
    }

    public async markChatRoomAsRead(roomId: Id, userId: Id): Promise<void> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const member = db.chatMembers.find(
            (m) => m.roomId === roomId && m.userId === userId,
        );
        const nowIso = toIsoUtc();
        if (member) {
            member.lastReadAt = nowIso;
        }
        // Also mark related notifications as read
        db.notifications.forEach((n) => {
            if (
                n.recipientId === userId &&
                n.entityType === "CHAT" &&
                n.entityId === roomId &&
                !n.readAt
            ) {
                n.readAt = nowIso;
            }
        });
        this.persist();
        this.notify();
    }

    public async createChatRoom(
        kind: "DIRECT" | "GROUP",
        title: string | null,
        memberUserIds: Id[],
        actorId: Id,
    ): Promise<ChatRoom> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const nowIso = toIsoUtc();

        // If DIRECT, check if existing room between the two users
        if (kind === "DIRECT" && memberUserIds.length > 0) {
            const otherId = memberUserIds[0];
            const existingRoom = db.chatRooms.find((r) => {
                if (r.kind !== "DIRECT") return false;
                const members = db.chatMembers.filter((m) => m.roomId === r.id);
                const uids = members.map((m) => m.userId);
                return (
                    uids.includes(actorId) &&
                    uids.includes(otherId) &&
                    uids.length === 2
                );
            });
            if (existingRoom) {
                return { ...existingRoom };
            }
        }

        const roomId = `r_${Date.now()}`;
        const newRoom: ChatRoom = {
            id: roomId,
            kind,
            title:
                kind === "GROUP" ? title?.trim() || "Nhóm trao đổi mới" : null,
            createdAt: nowIso,
        };
        db.chatRooms.push(newRoom);

        // Add members
        const allMemberIds = Array.from(new Set([actorId, ...memberUserIds]));
        allMemberIds.forEach((uid, idx) => {
            db.chatMembers.push({
                id: `rm_${Date.now()}_${idx}`,
                roomId,
                userId: uid,
                lastReadAt: uid === actorId ? nowIso : null,
                joinedAt: nowIso,
            });
        });

        this.persist();
        this.notify();
        return { ...newRoom };
    }

    public async triggerMockReminders(
        _actorId: Id,
    ): Promise<{ createdCount: number; messages: string[] }> {
        await this.delay();
        this.checkFailure();
        const db = this.getDb();
        const now = new Date();
        const nowIso = toIsoUtc(now);
        let createdCount = 0;
        const messages: string[] = [];

        const activeTasks = db.tasks.filter(
            (t) =>
                t.status !== "DRAFT" &&
                t.status !== "DONE" &&
                t.status !== "CANCELLED" &&
                t.dueAt,
        );
        const reminderHours = db.settings.reminderBeforeHours || 24;

        for (const task of activeTasks) {
            if (!task.dueAt || !task.primaryAssigneeId) continue;
            const dueTime = new Date(task.dueAt).getTime();
            const diffMs = dueTime - now.getTime();

            // Case 1: Overdue (diffMs < 0)
            if (diffMs < 0) {
                const existingOverdue = db.notifications.find(
                    (n) =>
                        n.entityId === task.id &&
                        n.entityType === "TASK" &&
                        n.type === "TASK_OVERDUE" &&
                        n.recipientId === task.primaryAssigneeId,
                );
                if (!existingOverdue) {
                    db.notifications.push({
                        id: `n_${Date.now()}_ov_${task.id}`,
                        recipientId: task.primaryAssigneeId,
                        type: "TASK_OVERDUE",
                        title: "Công việc quá hạn",
                        body: `Nhiệm vụ [${task.code}] "${task.title}" đã quá hạn hoàn thành. Vui lòng cập nhật kết quả hoặc báo cáo vướng mắc.`,
                        entityType: "TASK",
                        entityId: task.id,
                        createdAt: nowIso,
                        readAt: null,
                    });
                    createdCount++;
                    messages.push(
                        `Nhắc quá hạn: [${task.code}] gửi tới người chủ trì`,
                    );
                }
            }
            // Case 2: Due Soon (diffMs > 0 && diffMs <= reminderHours * 3600000)
            else if (diffMs <= reminderHours * 3600000) {
                const existingDueSoon = db.notifications.find(
                    (n) =>
                        n.entityId === task.id &&
                        n.entityType === "TASK" &&
                        n.type === "TASK_DUE_SOON" &&
                        n.recipientId === task.primaryAssigneeId,
                );
                if (!existingDueSoon) {
                    db.notifications.push({
                        id: `n_${Date.now()}_ds_${task.id}`,
                        recipientId: task.primaryAssigneeId,
                        type: "TASK_DUE_SOON",
                        title: `Việc sắp đến hạn (${reminderHours} giờ)`,
                        body: `Nhiệm vụ [${task.code}] "${task.title}" sắp đến hạn thực hiện. Vui lòng chuẩn bị kết quả giao nộp.`,
                        entityType: "TASK",
                        entityId: task.id,
                        createdAt: nowIso,
                        readAt: null,
                    });
                    createdCount++;
                    messages.push(
                        `Nhắc sắp đến hạn: [${task.code}] gửi tới người chủ trì`,
                    );
                }
            }
        }

        if (createdCount > 0) {
            this.persist();
            this.notify();
        }

        return { createdCount, messages };
    }
}

// Singleton repository instance
export const mockRepository = new MockRepository();
