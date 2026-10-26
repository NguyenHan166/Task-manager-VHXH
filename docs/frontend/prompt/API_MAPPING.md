# Hợp đồng giao tiếp dự kiến cho giai đoạn nối backend

Đây là quy ước **để frontend mock và backend sau này nói cùng một ngôn ngữ**, chưa phải API đang chạy. Nguồn entity/DTO duy nhất là [`data-contract.ts`](./data-contract.ts); tình huống mẫu là [`mock-seed.ts`](./mock-seed.ts). Khi triển khai NestJS, có thể version đường dẫn thành `/api/v1/...` nhưng giữ tên trường và ý nghĩa đã chốt hoặc ghi migration rõ ràng.

## Quy ước chung

- `id`: opaque string do server cấp. `code` công việc do server cấp theo loại; client không tự phát sinh mã production.
- Ngày giờ trong request/response là ISO 8601 UTC (`2026-10-26T09:30:00.000Z`). UI hiển thị `Asia/Ho_Chi_Minh`.
- Collection phân trang dùng `Page<T>`: `items`, `total`, `page`, `pageSize`. Bộ lọc task dùng `TaskQuery` và chạy phía server khi có backend.
- Response thành công có `{ "data": ... }`; lỗi dùng `{ "error": { "code", "message", "fieldErrors"? } }` và HTTP status phù hợp. Các lỗi chính: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`.
- Client chỉ gửi các input DTO trong contract; `createdById`, `approvedById`, `completedAt`, `role`, `objectKey`, `status` sau transition do server quyết định. Không dùng generic PATCH để nhảy trạng thái.
- Một thao tác nghiệp vụ phải ghi task, event, notification, submission/approval/request liên quan trong transaction phù hợp. Socket event chỉ phát sau khi lưu thành công.

## Ánh xạ repository → REST

| Hành động UI | REST dự kiến | Request / response chính | Quyền |
|---|---|---|---|
| Lấy phiên | `GET /api/auth/me` | `User` | Đăng nhập |
| Danh sách thành viên | `GET /api/users` | `Page<User>` | Manager; Staff chỉ danh bạ cần cho phối hợp theo chính sách |
| Tạo/khóa tài khoản | `POST /api/users`, `PATCH /api/users/:id/status` | User DTO → `User` | Manager |
| Danh sách việc | `GET /api/tasks` | `TaskQuery` → `Page<Task>` | Lọc từng bản ghi theo người xem |
| Chi tiết việc | `GET /api/tasks/:id` | `Task` + relations được phép | Quyền từng task |
| Tạo việc | `POST /api/tasks` | `CreateTaskInput` → `Task` | Manager tạo OFFICIAL; Staff tạo TEAM/PERSONAL |
| Sửa thông tin cơ bản | `PATCH /api/tasks/:id` | `UpdateTaskInput` → `Task` | Theo loại việc và vai trò |
| Giao việc | `POST /api/tasks/:id/publish` | `{}` → `Task` | Manager, OFFICIAL DRAFT |
| Bắt đầu | `POST /api/tasks/:id/start` | `{}` → `Task` | Chủ trì, TODO |
| Cập nhật tiến độ/vướng mắc | `POST /api/tasks/:id/progress` | `ProgressInput` → `Task` | Chủ trì, TODO/IN_PROGRESS |
| Gửi kết quả | `POST /api/tasks/:id/submit` | `SubmitTaskInput` → `TaskSubmission` + `Task` | Chủ trì, IN_PROGRESS |
| Duyệt/trả lại | `POST /api/tasks/:id/approve`, `/return` | `ReviewTaskInput` → `TaskApproval` + `Task` | Manager, OFFICIAL IN_REVIEW |
| Hủy/mở lại | `POST /api/tasks/:id/cancel`, `/reopen` | `{ reason: string }` → `Task` | Manager với OFFICIAL, ghi lịch sử |
| Xin gia hạn | `POST /api/tasks/:id/deadline-requests` | `CreateDeadlineRequestInput` → `TaskDeadlineRequest` | Chủ trì |
| Quyết định gia hạn | `POST /api/tasks/:id/deadline-requests/:requestId/decision` | `DecisionInput` → request + task | Manager |
| Xin đổi chủ trì | `POST /api/tasks/:id/assignee-requests` | `CreateAssigneeRequestInput` → `TaskAssigneeRequest` | Chủ trì |
| Quyết định đổi chủ trì | `POST /api/tasks/:id/assignee-requests/:requestId/decision` | `DecisionInput` → request + task | Manager |
| Bình luận/lịch sử | `POST /api/tasks/:id/comments`, `GET /api/tasks/:id/events` | body → `TaskComment`; `Page<TaskEvent>` | Người được xem task |
| Lời mời việc nhóm | `POST /api/tasks/:id/invitations/:participantId/respond` | `{ decision: "ACCEPTED" \| "DECLINED" }` → `TaskParticipant` | Đúng người được mời |
| Dự án/lịch | `GET /api/projects`, `GET /api/calendar` | `Page<Project>`, danh sách task theo khoảng ngày | Theo quyền task |
| Thông báo | `GET /api/notifications`, `POST /api/notifications/:id/read` | `Page<Notification>`, `Notification` | Chỉ người nhận |
| Báo cáo | `GET /api/dashboard`, `GET /api/reports/tasks`, `GET /api/reports/tasks/export` | Bộ lọc → số liệu/CSV/XLSX | Manager toàn phòng; Staff bản thân |
| Chat | `GET /api/chat/rooms`, `GET/POST /api/chat/rooms/:id/messages` | `Page<ChatRoom>`, `Page<ChatMessage>` | Thành viên phòng |
| File | `POST /api/files/upload-url`, `POST /api/files/complete`, `GET /api/files/:id/download-url` | Signed URL/metadata | Quyền entity liên kết |

Các endpoint cho assignee request, invitation, calendar và reopen là **đề xuất bổ sung** khi chốt backend; PRD hiện mô tả nghiệp vụ nhưng chưa chốt toàn bộ đường dẫn.

## Quy tắc tính số liệu

- Tổng KPI Manager mặc định: `type=OFFICIAL`, đã phát hành, `status` không là `DRAFT`/`CANCELLED`; trong seed là **7**.
- Seed mặc định: `TODO=2`, `IN_PROGRESS=2`, `IN_REVIEW=1`, `DONE=2`; quá hạn hiện tại **1** (`t04`). `t07` nháp và `t08` hủy hiển thị riêng.
- Quá hạn hiện tại: `dueAt < now` và `status` không thuộc `DRAFT`, `DONE`, `CANCELLED`. `IN_REVIEW` vẫn có thể quá hạn.
- Đúng hạn: task `DONE` với `completedAt <= dueAt` tại thời điểm duyệt. Seed có `t05` đúng hạn, `t06` trễ hạn.
- Thống kê theo người giao trách nhiệm chính chỉ đếm `primaryAssigneeId`; người phối hợp ở chỉ số riêng. `TEAM` chỉ xuất hiện khi bật bộ lọc bổ sung; `PERSONAL` không vào KPI toàn phòng.

## Chuyển từ file mock sang R2

`FileObject.status=MOCK_LOCAL` và `objectKey=null` chỉ phục vụ prototype. Với backend: server xác minh quyền entity và file, cấp signed PUT URL ngắn hạn; frontend upload trực tiếp tới R2; frontend gọi `/complete`; server kiểm tra object rồi tạo `FileObject.status=READY` và `FileLink`. Tải xuống qua signed GET URL sau kiểm tra quyền. Không đưa bytes file vào PostgreSQL hoặc secret R2 vào frontend.
