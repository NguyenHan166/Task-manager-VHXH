# BẢNG ÁNH XẠ API CHI TIẾT (FRONTEND ↔ BACKEND API MAPPING)
**Dự án:** Hệ thống Quản trị & Điều hành Công việc Nội bộ  
**Tài liệu tham chiếu kiến trúc đầy đủ:** [`docs/FRONTEND_BACKEND_HANDOFF.md`](../../FRONTEND_BACKEND_HANDOFF.md)  
**Hợp đồng dữ liệu TypeScript:** [`Frontend/src/shared/data-contract.ts`](../../Frontend/src/shared/data-contract.ts)  
**Dữ liệu mẫu chuẩn (Fixtures):** [`Frontend/src/mocks/mock-seed.ts`](../../Frontend/src/mocks/mock-seed.ts)  
**Ngày cập nhật:** 27/10/2026 (Phiên bản đồng bộ hoàn chỉnh sau nâng cấp 3 vai trò & Nhiệm vụ định kỳ)

---

## 1. NGUYÊN TẮC THIẾT KẾ & QUY ƯỚC CHUNG

1. **Chuẩn mã hóa thời gian:** Mọi trường thời gian trong Request Body và Response JSON bắt buộc định dạng **ISO 8601 UTC kết thúc bằng ký tự `Z`** (Ví dụ: `2026-10-27T08:30:00.000Z`). Frontend chịu trách nhiệm định dạng sang múi giờ `Asia/Ho_Chi_Minh` (GMT+7) khi hiển thị.
2. **Quy tắc Hạn chót chỉ có ngày (Date-only Due Date):** Khi Client gửi hạn chót dạng ngày (`YYYY-MM-DD`), Backend tự động đọc cấu hình `defaultDueHour` trong `AppSettings` (mặc định là `16`, tức 16:00:00 GMT+7 = 09:00:00Z) để ghép thành thời điểm kết thúc hành chính.
3. **Phân trang chuẩn:** Các API danh sách sử dụng cấu trúc `Page<T>`:
   ```json
   {
     "data": {
       "items": [ ... ],
       "total": 120,
       "page": 1,
       "pageSize": 10
     }
   }
   ```
4. **Quy chuẩn mã định danh (`id` và `code`):**
   - `id`: Opaque string (UUID v4) do máy chủ khởi tạo.
   - `code`: Mã công việc theo quy định nhà nước (`CV-YYYY-XXXX` cho việc chính thức, `NH-YYYY-XXXX` cho việc nhóm, `CN-YYYY-XXXX` cho việc cá nhân), do máy chủ tự động phát sinh trong transaction khi tạo việc.
5. **Định dạng phản hồi & Xử lý lỗi:**
   - Thành công: `{ "data": ... }` kèm HTTP Status `200 OK` hoặc `201 Created`.
   - Lỗi: `{ "error": { "code": "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT", "message": "...", "fieldErrors"?: Record<string, string> } }`.
6. **Bảo vệ trường hệ thống (Server-enforced fields):** Client gửi Body DTO **tuyệt đối không được phép tự quyết định**:
   - `createdById`: Luôn trích xuất từ JWT Claims của người gọi (`req.user.id`).
   - `approvedById`: Luôn trích xuất từ JWT Claims khi phê duyệt.
   - `completedAt`: Luôn do máy chủ tự động gán bằng thời gian thực `NOW()`.
   - `status`: Không được nhảy cóc qua generic `PATCH`; phải đi qua các endpoint chuyển trạng thái riêng biệt.
   - `role`: Chỉ `MANAGER` mới có quyền thay đổi thông qua endpoint quản trị thành viên.
   - `objectKey`: Khóa lưu trữ R2 do máy chủ cấp phát.

---

## 2. MA TRẬN 3 VAI TRÒ (RBAC MODEL)

- **`MANAGER` (Trưởng phòng kiêm Quản trị hệ thống):** Toàn quyền quản trị tài khoản (`/api/users`), cấu hình hệ thống (`/api/settings`), sao lưu (`/api/backup`), kiểm toán (`/api/audit-logs`) và toàn quyền chỉ đạo, giao việc, duyệt việc, điều hành nghiệp vụ.
- **`DEPUTY_MANAGER` (Phó phòng - Điều hành):** Đầy đủ thẩm quyền điều hành, giao việc chính thức, phê duyệt báo cáo, giải quyết xin gia hạn/đổi người, quản lý nhiệm vụ định kỳ. **Tuyệt đối không có quyền quản trị tài khoản người dùng, cài đặt hệ thống, sao lưu hay nhật ký kiểm toán hệ thống (Trả về 403 Forbidden).**
- **`STAFF` (Chuyên viên):** Thực hiện các nhiệm vụ được giao, nộp báo cáo kết quả, xin gia hạn/đổi người chủ trì, tham gia trao đổi nội bộ, tạo việc nhóm và việc cá nhân, xem danh sách nhiệm vụ định kỳ và nộp báo cáo định kỳ trực tiếp.

---

## 3. BẢNG ÁNH XẠ CHI TIẾT REPOSITORY METHOD ↔ REST API ENDPOINTS

### 3.1. Phân hệ Xác thực & Phiên làm việc (Authentication & Session)

| Hành động UI | Phương thức Repository | Endpoint REST | Request DTO | Response Type | Quyền truy cập |
|---|---|---|---|---|---|
| Đăng nhập tài khoản | `login(email, password)` | `POST /api/auth/login` | `{ email: string, password: string }` | `{ accessToken: string, user: User }` | Công khai |
| Lấy phiên đăng nhập hiện tại | `getMe()` / `getUserById(id)` | `GET /api/auth/me` | None (Bearer Token) | `User` | Đã đăng nhập |
| Đăng xuất | `logout()` | `POST /api/auth/logout` | None (Bearer Token) | `{ success: boolean }` | Đã đăng nhập |

### 3.2. Phân hệ Quản trị Thành viên & Tài khoản (`/members`)

| Hành động UI | Phương thức Repository | Endpoint REST | Request DTO | Response Type | Quyền & Quy tắc kiểm tra |
|---|---|---|---|---|---|
| Danh sách thành viên | `getUsers()` | `GET /api/users` | `UserQuery` (`page, pageSize, status, role, search`) | `Page<User>` | `MANAGER`, `DEPUTY_MANAGER` xem đầy đủ; `STAFF` xem danh bạ phối hợp |
| Chi tiết 1 thành viên | `getUserById(id)` | `GET /api/users/:id` | None | `User` | Mọi user đã đăng nhập |
| Thêm thành viên mới | `createUser(input)` | `POST /api/users` | `CreateUserInput` (`displayName, email [là username, bắt buộc], role, jobTitle, department, phoneNumber, initialPassword?`) | `{ user: User, temporaryPassword?: string }` | **Chỉ `MANAGER`** (`DEPUTY_MANAGER` & `STAFF` bị `403 Forbidden`) |
| Cập nhật thông tin & đổi vai trò | `updateUser(id, updates)` | `PATCH /api/users/:id` | `UpdateUserInput` (`displayName, email, role, jobTitle, department, phoneNumber, status`) | `User` | **Chỉ `MANAGER`**. Bảo vệ: Cấm hạ vai trò hoặc khóa tài khoản `MANAGER` hoạt động cuối cùng; cấm tự khóa tài khoản của chính mình. |
| Đặt lại mật khẩu | `resetPassword(id, newPass?)` | `POST /api/users/:id/reset-password` | `{ newPassword?: string }` | `{ temporaryPassword: string, message: string }` | **Chỉ `MANAGER`**. Tự động sinh mật khẩu ngẫu nhiên an toàn nếu không truyền. |
| Thống kê tải công việc thành viên | (Selector) | `GET /api/users/:id/workload` | `{ fromDate?: IsoDateTime, toDate?: IsoDateTime }` | `UserWorkloadStats` | `MANAGER`, `DEPUTY_MANAGER`: Xem mọi thành viên; `STAFF`: Chỉ xem chính mình |

### 3.3. Phân hệ Quản lý Công việc (`/tasks`, `/tasks/:id`)

| Hành động UI | Phương thức Repository | Endpoint REST | Request DTO | Response Type | Quyền & Quy tắc kiểm tra |
|---|---|---|---|---|---|
| Truy vấn danh sách công việc | `getTasks()`, `queryTasks(query)` | `GET /api/tasks` | `TaskQuery` (`scope, type, status, priority, projectId, primaryAssigneeId, search, dueFrom, dueTo, page, pageSize, sortBy, sortDirection`) | `Page<Task>` | Lọc theo `canSeeTask`: `MANAGER`/`DEPUTY_MANAGER` xem toàn bộ việc `OFFICIAL`; `STAFF` xem việc mình tham gia |
| Xem chi tiết công việc | `getTaskById(id)` | `GET /api/tasks/:id` | None | `TaskDetailResponse` | Bản ghi thỏa mãn `canSeeTask` |
| Tạo công việc mới | `createTask(input, creatorId)` | `POST /api/tasks` | `CreateTaskInput` (`type, title, description, deliverable, priority, primaryAssigneeId, collaboratorIds, watcherIds, dueAt, projectId, parentTaskId`) | `Task` | `MANAGER`, `DEPUTY_MANAGER`: Mọi loại việc; `STAFF`: Chỉ tạo `TEAM`, `PERSONAL` |
| Phát hành / Giao việc chính thức | `publishTask(id, actorId)` | `POST /api/tasks/:id/publish` | None | `Task` | `MANAGER`, `DEPUTY_MANAGER` với việc `OFFICIAL` đang `DRAFT` |
| Bắt đầu thực hiện việc | `startTask(id, actorId)` | `POST /api/tasks/:id/start` | None | `Task` | Người chủ trì việc hoặc Lãnh đạo; việc đang `TODO` |
| Cập nhật tiến độ & Vướng mắc | `updateTaskProgress(id, progress, isBlocked, reason, actorId)` | `POST /api/tasks/:id/progress` | `ProgressInput` (`progressPercent: 0..100, isBlocked: boolean, blockedReason: string | null`) | `Task` | Người chủ trì hoặc Lãnh đạo; việc đang `TODO` hoặc `IN_PROGRESS` |
| Chỉnh sửa thông tin cơ bản | `managerUpdateTaskDetails(id, updates, actorId)` | `PATCH /api/tasks/:id` | `UpdateTaskInput` (`title, description, deliverable, priority, projectId, dueAt?`) | `Task` | `MANAGER`, `DEPUTY_MANAGER` với việc `OFFICIAL`; Người tạo với việc khác |
| Hủy bỏ công việc | `cancelTask(id, reason, actorId)` | `POST /api/tasks/:id/cancel` | `{ reason: string }` | `Task` | `MANAGER`, `DEPUTY_MANAGER` với việc `OFFICIAL`. Bắt buộc nhập lý do. |
| Mở lại việc đã hủy | `reopenTask(id, reason, actorId)` | `POST /api/tasks/:id/reopen` | `{ reason: string }` | `Task` | `MANAGER`, `DEPUTY_MANAGER` với việc đang `CANCELLED`. Bắt buộc nhập lý do. |
| Chuyển đổi việc nhóm sang chính thức | `convertTeamToOfficial(id, updates, actorId)` | `POST /api/tasks/:id/convert-official` | `ConvertTeamInput` (`title?, deliverable, primaryAssigneeId, dueAt`) | `Task` | `MANAGER`, `DEPUTY_MANAGER`; việc phải có `type = TEAM` |
| Tạo công việc con (Subtask) | `createSubtask(parentId, title, assigneeId, dueAt, actorId)` | `POST /api/tasks/:id/subtasks` | `{ title: string, primaryAssigneeId?: string, dueAt?: IsoDateTime }` | `Task` | Người chủ trì việc cha hoặc Lãnh đạo |
| Xóa công việc cá nhân | `deletePersonalTask(id, actorId)` | `DELETE /api/tasks/:id` | None | `{ success: boolean }` | Chỉ người tạo việc (`createdById`) và việc phải là `PERSONAL` |

### 3.4. Phân hệ Báo cáo Kết quả, Phê duyệt & Lịch sử Thực hiện

| Hành động UI | Phương thức Repository | Endpoint REST | Request DTO | Response Type | Quyền & Quy tắc kiểm tra |
|---|---|---|---|---|---|
| Nộp báo cáo kết quả | `addSubmission(taskId, input, submitterId)` | `POST /api/tasks/:id/submissions` | `SubmitTaskInput` (`summary, details?, deliverableUrl?, notes?, fileIds: string[]`) | `{ submission: TaskSubmission, task: Task }` | Người chủ trì; việc chuyển sang `IN_REVIEW` |
| Thu hồi báo cáo chờ duyệt | `withdrawSubmission(taskId, submitterId, reason)` | `POST /api/tasks/:id/submissions/:submissionId/withdraw` | `{ reason?: string }` | `{ submission: TaskSubmission, task: Task }` | Đúng người đã nộp báo cáo; việc đang `IN_REVIEW` và chưa bị xét duyệt |
| Phê duyệt hoàn thành | `decideApproval(taskId, submissionId, 'APPROVED', reason, actorId)` | `POST /api/tasks/:id/approve` | `{ reason?: string }` | `{ approval: TaskApproval, task: Task }` | `MANAGER`, `DEPUTY_MANAGER`; việc chuyển sang `DONE`, lưu `completedAt = NOW()` |
| Trả lại yêu cầu chỉnh sửa | `decideApproval(taskId, submissionId, 'RETURNED', reason, actorId)` | `POST /api/tasks/:id/return` | `{ reason: string }` | `{ approval: TaskApproval, task: Task }` | `MANAGER`, `DEPUTY_MANAGER`; bắt buộc có lý do; việc quay lại `IN_PROGRESS` |
| Thêm bình luận | `addComment(taskId, body, authorId)` | `POST /api/tasks/:id/comments` | `{ body: string }` | `TaskComment` | Mọi user có quyền xem task |
| Lấy lịch sử sự kiện (Audit) | `getEvents(taskId)` | `GET /api/tasks/:id/events` | `PageQuery` (`page, pageSize`) | `Page<TaskEvent>` | Mọi user có quyền xem task |
| Phản hồi lời mời việc nhóm | `respondInvitation(participantId, decision, actorId)` | `POST /api/tasks/:id/invitations/:participantId/respond` | `{ decision: 'ACCEPTED' | 'DECLINED' }` | `TaskParticipant` | Đúng thành viên được mời |

### 3.5. Phân hệ Xử lý Yêu cầu Thay đổi (Gia hạn & Đổi Chủ trì)

| Hành động UI | Phương thức Repository | Endpoint REST | Request DTO | Response Type | Quyền & Quy tắc kiểm tra |
|---|---|---|---|---|---|
| Xin gia hạn hạn chót | `createDeadlineRequest(...)` | `POST /api/tasks/:id/deadline-requests` | `CreateDeadlineRequestInput` (`proposedDueAt, reason`) | `TaskDeadlineRequest` | Người chủ trì việc |
| Quyết định gia hạn | `decideDeadlineRequest(...)` | `POST /api/tasks/:id/deadline-requests/:requestId/decision` | `DecisionInput` (`decision: 'APPROVED' | 'REJECTED', reason?: string`) | `{ request: TaskDeadlineRequest, task: Task }` | `MANAGER`, `DEPUTY_MANAGER`. Nếu APPROVE, cập nhật `dueAt` của Task. |
| Xin đổi người chủ trì | `createAssigneeRequest(...)` | `POST /api/tasks/:id/assignee-requests` | `CreateAssigneeRequestInput` (`proposedAssigneeId, reason`) | `TaskAssigneeRequest` | Người chủ trì việc |
| Quyết định đổi chủ trì | `decideAssigneeRequest(...)` | `POST /api/tasks/:id/assignee-requests/:requestId/decision` | `DecisionInput` (`decision: 'APPROVED' | 'REJECTED', reason?: string`) | `{ request: TaskAssigneeRequest, task: Task }` | `MANAGER`, `DEPUTY_MANAGER`. Nếu APPROVE, cập nhật `primaryAssigneeId` của Task. |

### 3.6. Phân hệ Nhiệm vụ Định kỳ (`/recurrence`)

| Hành động UI | Phương thức Repository | Endpoint REST | Request DTO | Response Type | Quyền & Quy tắc kiểm tra |
|---|---|---|---|---|---|
| Danh sách mẫu định kỳ | `getRecurrenceRules()` | `GET /api/recurrence-rules` | None | `RecurrenceRule[]` | Mọi thành viên (`MANAGER`, `DEPUTY_MANAGER`, `STAFF`) |
| Lịch sử các chu kỳ đã sinh | `getRecurrenceInstances()` | `GET /api/recurrence-instances` | `{ ruleId?: string }` | `RecurrenceInstance[]` | Mọi thành viên |
| Tạo mẫu định kỳ mới | `createRecurrenceRule(rule, creatorId)` | `POST /api/recurrence-rules` | `CreateRecurrenceRuleInput` (`title, description, scope: 'ALL' | 'CUSTOM', assigneeIds: string[], priority, frequency, dueAfterHours`) | `RecurrenceRule` | `MANAGER`, `DEPUTY_MANAGER` (`STAFF` bị `403 Forbidden`) |
| Sửa mẫu định kỳ | `updateRecurrenceRule(id, updates)` | `PATCH /api/recurrence-rules/:id` | `UpdateRecurrenceRuleInput` (`title?, description?, scope?, assigneeIds?, priority?, frequency?, dueAfterHours?`) | `RecurrenceRule` | `MANAGER`, `DEPUTY_MANAGER` |
| Bật / Tắt trạng thái mẫu | `toggleRecurrenceRule(id)` | `POST /api/recurrence-rules/:id/toggle` | None | `RecurrenceRule` | `MANAGER`, `DEPUTY_MANAGER` |
| Xóa mẫu định kỳ | `deleteRecurrenceRule(id)` | `DELETE /api/recurrence-rules/:id` | None | `{ success: boolean }` | `MANAGER`, `DEPUTY_MANAGER` |
| Kích hoạt sinh chu kỳ ngay | `generateRecurrenceNext(id, actorId)` | `POST /api/recurrence-rules/:id/generate` | None | `{ tasks: Task[], instance: RecurrenceInstance }` | `MANAGER`, `DEPUTY_MANAGER`. Sinh riêng từng task cho từng chuyên viên. |
| Nộp báo cáo định kỳ trực tiếp | `submitRecurrenceReport(taskId, summary, fileIds, userId)` | `POST /api/tasks/:id/submissions` | `SubmitTaskInput` | `{ submission: TaskSubmission, task: Task }` | Đúng chuyên viên được giao nhiệm vụ định kỳ |

### 3.7. Phân hệ Dashboard, Báo cáo & Lịch công tác

| Hành động UI | Phương thức Repository | Endpoint REST | Request DTO | Response Type | Quyền & Quy tắc kiểm tra |
|---|---|---|---|---|---|
| Thống kê Dashboard tập trung | (Server SQL Aggregation) | `GET /api/dashboard/stats` | `{ scope: 'DEPT' | 'STAFF' }` | `ManagerDashboardStats` hoặc `StaffDashboardStats` | `scope=DEPT` dành cho `MANAGER`, `DEPUTY_MANAGER`; `STAFF` xem `scope=STAFF` |
| Báo cáo tổng hợp KPI | (Server Aggregation) | `GET /api/reports/kpi` | `{ fromDate?: IsoDateTime, toDate?: IsoDateTime, projectId?: string }` | `{ summary: ManagerDashboardStats, workloads: UserWorkloadStats[] }` | `MANAGER`, `DEPUTY_MANAGER` xem toàn đơn vị; `STAFF` xem phần của mình |
| Xuất tệp báo cáo công việc | (Export Handler) | `GET /api/reports/tasks/export` | `TaskQuery & { format: 'CSV' | 'XLSX' }` | Binary File Stream | `MANAGER`, `DEPUTY_MANAGER` |
| Lịch công tác phòng ban | `getTasks()`, `getParticipants()` | `GET /api/calendar` | `{ fromDate: IsoDateTime, toDate: IsoDateTime }` | `CalendarEventItem[]` | Lọc theo `canSeeTask` |
| Danh sách dự án | `getProjects()` | `GET /api/projects` | `PageQuery` | `Page<Project>` | Mọi user đã đăng nhập |

### 3.8. Phân hệ Tệp đính kèm Cloudflare R2 (`/files`)

| Hành động UI | Phương thức Repository | Endpoint REST | Request DTO | Response Type | Quyền & Quy tắc kiểm tra |
|---|---|---|---|---|---|
| Cấp URL tải tệp lên R2 | `uploadMockFile` (thay thế) | `POST /api/files/upload-url` | `{ originalName: string, mimeType: string, sizeBytes: number, entityType: string, entityId: string }` | `{ fileId: string, uploadUrl: string, objectKey: string }` | Kiểm tra quyền ghi đối với `entityId` và hạn mức `maxFileSizeMb` |
| Xác nhận hoàn tất upload | (Thêm mới) | `POST /api/files/complete` | `{ fileId: string }` | `FileObject` | Server gọi `HeadObject` R2 xác thực file trước khi commit DB |
| Cấp URL tải xuống tệp | (Thêm mới) | `GET /api/files/:id/download-url` | None | `{ downloadUrl: string, originalName: string }` | Kiểm tra quyền đọc đối với thực thể liên kết với tệp |
| Danh sách tệp đã tải lên | `getFiles()` | `GET /api/files` | `PageQuery & { entityType?, search? }` | `Page<FileObject>` | Lọc theo các file thuộc entity user được phép truy cập |
| Xóa tệp đính kèm | `deleteFile(id, actorId)` | `DELETE /api/files/:id` | None | `{ success: boolean }` | Người tải lên hoặc `MANAGER`, `DEPUTY_MANAGER` |

### 3.9. Phân hệ Trao đổi Nội bộ (Chat) & Thông báo

| Hành động UI | Phương thức Repository | Endpoint REST | Request DTO | Response Type | Quyền & Quy tắc kiểm tra |
|---|---|---|---|---|---|
| Danh sách phòng chat | `getChatRooms(userId)` | `GET /api/chat/rooms` | None | `ChatRoomItem[]` | Thành viên tham gia phòng |
| Tin nhắn trong phòng | `getChatMessages(roomId)` | `GET /api/chat/rooms/:id/messages` | `PageQuery` (`beforeId?, limit?`) | `Page<ChatMessage>` | Thành viên của phòng chat |
| Gửi tin nhắn mới | `sendChatMessage(roomId, body, senderId)` | `POST /api/chat/rooms/:id/messages` | `{ body: string }` | `ChatMessage` | Thành viên của phòng chat (Phát Socket event) |
| Đánh dấu phòng chat đã đọc | `markChatRoomAsRead(roomId, userId)` | `POST /api/chat/rooms/:id/read` | None | `{ success: boolean }` | Thành viên của phòng chat |
| Tạo phòng chat mới | `createChatRoom(...)` | `POST /api/chat/rooms` | `{ kind: 'DIRECT' | 'GROUP', title?: string, memberIds: string[] }` | `ChatRoom` | Mọi user đã đăng nhập |
| Danh sách thông báo | `getNotifications(userId)` | `GET /api/notifications` | `PageQuery & { unreadOnly?: boolean }` | `Page<Notification>` | Chỉ xem thông báo của chính mình |
| Đánh dấu đã đọc 1 thông báo | `markNotificationAsRead(id)` | `POST /api/notifications/:id/read` | None | `Notification` | Đúng người nhận |
| Đánh dấu tất cả đã đọc | `markAllNotificationsAsRead(userId)` | `POST /api/notifications/read-all` | None | `{ success: boolean }` | Chính người dùng |

### 3.10. Phân hệ Cài đặt Hệ thống, Kiểm toán & Sao lưu

| Hành động UI | Phương thức Repository | Endpoint REST | Request DTO | Response Type | Quyền & Quy tắc kiểm tra |
|---|---|---|---|---|---|
| Lấy cấu hình hệ thống | `getSettings()` | `GET /api/settings` | None | `AppSettings` | Mọi user đã đăng nhập |
| Cập nhật cấu hình hệ thống | `updateSettings(updates)` | `PATCH /api/settings` | `Partial<AppSettings>` (`workspaceName, defaultDueHour, reminderBeforeHours, maxFileSizeMb`) | `AppSettings` | **Chỉ `MANAGER`** (`DEPUTY_MANAGER` & `STAFF` bị `403 Forbidden`) |
| Xem nhật ký kiểm toán (`/audit-logs`) | `getEvents()` | `GET /api/audit-logs` | `AuditLogQuery` (`page, pageSize, kind, actorId, taskId, fromDate, toDate`) | `Page<TaskEvent>` | **Chỉ `MANAGER`** (`DEPUTY_MANAGER` & `STAFF` bị `403 Forbidden`) |
| Sao lưu cơ sở dữ liệu (`/settings`) | Mock export | `GET /api/backup` | None | Application/JSON hoặc SQL Stream | **Chỉ `MANAGER`** (`DEPUTY_MANAGER` & `STAFF` bị `403 Forbidden`) |

---

## 4. BẢNG ĐỐI CHIẾU THỰC THỂ TYPESCRIPT VÀ BẢNG POSTGRESQL

| Thực thể TypeScript (`data-contract.ts`) | Tên Bảng PostgreSQL | Khóa Chính | Khóa Ngoại Quan trọng | Ý nghĩa Lưu trữ Lịch sử Bất biến |
|---|---|---|---|---|
| `User` | `users` | `id` (VARCHAR) | - | Email là username duy nhất; lưu hash mật khẩu an toàn |
| `Project` | `projects` | `id` (VARCHAR) | `owner_id` → `users` | Quản lý dự án / danh mục công việc chung |
| `Task` | `tasks` | `id` (VARCHAR) | `created_by_id`, `primary_assignee_id`, `project_id`, `parent_task_id`, `approved_by_id` | Thực thể lõi, trạng thái, tiến độ, thời hạn |
| `TaskParticipant` | `task_participants` | `id` (VARCHAR) | `task_id` → `tasks`, `user_id` → `users` | Lưu vai trò phối hợp/theo dõi và trạng thái phản hồi lời mời |
| `TaskSubmission` | `task_submissions` | `id` (VARCHAR) | `task_id` → `tasks`, `submitted_by_id` → `users` | **Không ghi đè**: Mỗi lần nộp là một bản ghi, hỗ trợ thu hồi |
| `TaskApproval` | `task_approvals` | `id` (VARCHAR) | `task_id` → `tasks`, `submission_id` → `task_submissions`, `decided_by_id` → `users` | Lưu vết mọi quyết định Duyệt/Trả lại kèm ý kiến đánh giá |
| `TaskDeadlineRequest` | `task_deadline_requests` | `id` (VARCHAR) | `task_id` → `tasks`, `requested_by_id` → `users`, `decided_by_id` → `users` | Lịch sử xin gia hạn và lý do phê duyệt/từ chối |
| `TaskAssigneeRequest` | `task_assignee_requests` | `id` (VARCHAR) | `task_id` → `tasks`, `requested_by_id` → `users`, `proposed_assignee_id` → `users` | Lịch sử xin đổi chủ trì và lý do phê duyệt/từ chối |
| `TaskEvent` | `task_events` | `id` (VARCHAR) | `task_id` → `tasks`, `actor_id` → `users` | **Event Sourcing**: Bảng Append-Only lưu vết mọi biến động tiến độ, trạng thái (before/after JSONB) |
| `TaskComment` | `task_comments` | `id` (VARCHAR) | `task_id` → `tasks`, `author_id` → `users` | Thảo luận và trao đổi công việc |
| `RecurrenceRule` | `recurrence_rules` | `id` (VARCHAR) | `owner_id` → `users` | Mẫu định kỳ; hỗ trợ `scope: ALL` (cả phòng) hoặc `CUSTOM` (nhiều người) |
| `RecurrenceRuleAssignee` | `recurrence_rule_assignees` | `(rule_id, user_id)` | `rule_id` → `recurrence_rules`, `user_id` → `users` | Bảng nối lưu danh sách chuyên viên cho mẫu định kỳ |
| `RecurrenceInstance` | `recurrence_instances` | `id` (VARCHAR) | `rule_id` → `recurrence_rules` | Chu kỳ định kỳ đã phát sinh (Unique theo `ruleId + periodKey`) |
| `RecurrenceInstanceTask` | `recurrence_instance_tasks` | `(instance_id, task_id)` | `instance_id` → `recurrence_instances`, `task_id` → `tasks` | Bảng nối lưu danh sách các công việc đã phát sinh trong chu kỳ |
| `FileObject` | `files` | `id` (VARCHAR) | `uploaded_by_id` → `users` | Metadata tệp, trạng thái upload và `objectKey` trên Cloudflare R2 |
| `FileLink` | `file_links` | `id` (VARCHAR) | `file_id` → `files` | Quan hệ đa hình (Polymorphic Link) gắn tệp vào Task/Submission/Comment |
| `ChatRoom` | `chat_rooms` | `id` (VARCHAR) | - | Phòng chat trực tiếp hoặc nhóm |
| `ChatRoomMember` | `chat_room_members` | `id` (VARCHAR) | `room_id` → `chat_rooms`, `user_id` → `users` | Thành viên phòng chat và thời điểm đọc tin nhắn gần nhất |
| `ChatMessage` | `chat_messages` | `id` (VARCHAR) | `room_id` → `chat_rooms`, `sender_id` → `users` | Nội dung tin nhắn trao đổi |
| `Notification` | `notifications` | `id` (VARCHAR) | `recipient_id` → `users` | Thông báo chuông hệ thống |
| `AppSettings` | `app_settings` | `id` (INT = 1) | - | Cấu hình tham số toàn hệ thống dạng Singleton |

---

## 5. TÓM TẮT DỮ LIỆU SEED KIỂM THỬ (BENCHMARK TEST FIXTURES)

Khi khởi tạo database và chạy test, đội Backend đối chiếu với các kết quả chuẩn sau từ bộ seed:
- **Người dùng:** 6 tài khoản (`u01`: Manager, `u06`: Deputy Manager, `u02`–`u05`: Staff).
- **Công việc:** 17 công việc (`t01`–`t17`).
- **Quy tắc định kỳ:** `rr01` (Hàng tháng - CUSTOM `u02, u03`), `rr02` (Hàng tuần - ALL `u02`–`u05`).
- **Chu kỳ đã sinh:** `ri01` (2026-W44) sinh 4 nhiệm vụ con: `t14, t15, t16, t17`.
- **Kết quả KPI mẫu ban đầu (`t01`–`t09`):**
  - Tổng việc chính thức điều hành: **7** việc (`t01, t02, t03, t04, t05, t06, t09`).
  - Phân loại: TODO: **2**, IN_PROGRESS: **2**, IN_REVIEW: **1**, DONE: **2**.
  - Quá hạn: **1** (`t04`).
  - Hoàn thành đúng hạn: **1 / 2** việc DONE (`t05` đúng hạn, `t06` trễ hạn).
  - Tách riêng: Nháp: **1** (`t07`), Hủy: **1** (`t08`). Việc nhóm (`t10, t11`) và việc cá nhân (`t12, t13`) không vào KPI phòng.
