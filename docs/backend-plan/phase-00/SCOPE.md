# BE-00-01 — Phạm vi và tuyến FE/BE

**Nguồn quyết định:** [Phase 00](../PHASE_00_CONTRACT.md) D-01–D-11, đặc tả §13, [handoff](../../FRONTEND_BACKEND_HANDOFF.md) §2, [API mapping](../../frontend/prompt/API_MAPPING.md), `Frontend/src/app/main.tsx` và `Frontend/src/components/layout/AppShell.tsx` (đối chiếu 27/10/2026).

**Quy ước:** `owner` là đội chịu trách nhiệm triển khai: BE, FE hoặc BE+FE. `Prototype mock` nghĩa là route/điều khiển đang đọc `MockRepository`/selector; không phải API đã hoạt động. P0 mở sau Phase 08; P1 mở sau Phase 09. Các route P1 phải hiển thị nhãn “Dữ liệu mẫu · P1” khi còn mock; các hành động P1 đặt trong route P0 phải có nhãn hoặc feature gate khi nối P0. `GET /api/users` là danh bạ có projection theo vai trò, còn quyền quản trị tài khoản chỉ MANAGER.

| Feature | Phase | Endpoint chuẩn | FE route | Owner | Trạng thái 27/10/2026 |
|---|---|---|---|---|---|
| Nền tảng NestJS/PostgreSQL, env, migration, CI, logging, health | P0 · 01 | `GET /api/health` và hạ tầng nội bộ | Không có route riêng | BE | `Server/` chưa có backend chạy thật |
| Đăng nhập email/mật khẩu, refresh, logout, logout-all, phiên hiện tại | P0 · 02 | `POST /api/auth/login`, `/refresh`, `/logout`, `/logout-all`; `GET /api/auth/me` | `/login`, mọi route | BE+FE | Chọn tài khoản demo; chưa có auth BE |
| Hồ sơ, đổi mật khẩu cá nhân, danh bạ chọn người | P0 · 02 | `GET/PATCH /api/auth/me`, `POST /api/auth/change-password`, `GET /api/users`, `GET /api/users/:id` | `/profile`, form giao việc | BE+FE | Prototype mock |
| Quản trị user, vai trò, khóa/mở, đặt lại mật khẩu | P0 · 02 | `POST /api/users`, `PATCH /api/users/:id`, `POST /api/users/:id/reset-password` | `/members` | BE+FE | Prototype mock; route MANAGER-only |
| Danh sách/Kanban cơ bản, tìm kiếm, lọc, sort, chi tiết OFFICIAL | P0 · 03 | `GET /api/tasks`, `GET /api/tasks/:id` | `/tasks`, `/tasks/:id` | BE+FE | Prototype mock; FE lọc toàn bộ trong RAM |
| Tạo OFFICIAL nháp, phát hành | P0 · 03–04 | `POST /api/tasks`, `POST /api/tasks/:id/publish` | `/tasks/create`, `/tasks/:id` | BE+FE | Prototype mock; một số guard FE chỉ MANAGER |
| Bắt đầu, tiến độ, vướng mắc | P0 · 04 | `POST /api/tasks/:id/start`, `/progress` | `/tasks/:id` | BE+FE | Prototype mock |
| Sửa metadata và điều chỉnh trực tiếp hạn/chủ trì có lý do | P0 · 03–04 | `PATCH /api/tasks/:id`, `POST /api/tasks/:id/adjust` | `/tasks/:id` | BE+FE | Prototype mock; API phải tách trường hệ thống khỏi PATCH |
| Hủy/mở lại OFFICIAL | P0 · 04 | `POST /api/tasks/:id/cancel`, `/reopen` | `/tasks/:id` | BE+FE | Prototype mock |
| Nộp, thu hồi, duyệt, trả lại kết quả | P0 · 04 | `POST /api/tasks/:id/submissions`, `/submissions/:submissionId/withdraw`, `/approve`, `/return` | `/tasks/:id`, `/approvals` | BE+FE | Prototype mock |
| Bình luận, lịch sử sự kiện nhiệm vụ | P0 · 03–04 | `GET/POST /api/tasks/:id/comments`, `GET /api/tasks/:id/events` | `/tasks/:id` | BE+FE | Prototype mock |
| Upload, xác nhận, danh sách, tải, gỡ liên kết file R2 | P0 · 05 | `POST /api/files/upload-url`, `/complete`; `GET /api/files`, `/files/:id/download-url`; `DELETE /api/files/:id` | `/files`, `/tasks/:id` | BE+FE | Tệp mock trong trình duyệt; chưa có R2 |
| Thông báo trong app, đếm chưa đọc, đánh dấu đã đọc | P0 · 06 | `GET /api/notifications`, `/notifications/unread-count`; `POST /api/notifications/:id/read`, `/read-all` | `/notifications`, chuông AppShell | BE+FE | Prototype mock |
| Nhắc hạn và tín hiệu realtime nhiệm vụ/thông báo | P0 · 06 | Job BE; Socket.IO `notification:new`, `task:updated` | `/dashboard`, chuông, `/tasks` | BE+FE | Chỉ mô phỏng dữ liệu; không có job/socket BE |
| Dashboard phòng/cá nhân, tải việc mỗi thành viên | P0 · 07 | `GET /api/dashboard/stats?scope=DEPT|STAFF`, `GET /api/users/:id/workload` | `/dashboard`, `/members` | BE+FE | Selector trên mock |
| KPI, danh sách báo cáo, xuất CSV/XLSX | P0 · 07 | `GET /api/reports/kpi`, `/reports/tasks`, `/reports/tasks/export` | `/reports` | BE+FE | Prototype mock/export client |
| Cấu hình, audit quản trị, backup/restore | P0 · 07 | `GET/PATCH /api/settings`, `GET /api/audit-logs`, `GET /api/backup` (metadata); job backup/restore | `/settings` | BE+FE | Prototype mock; route MANAGER-only |
| Tích hợp HTTP, staging, nghiệm thu P0 | P0 · 08 | Toàn bộ API P0 | Các route P0 | BE+FE | Chưa bắt đầu; production data cần D-08 |
| TEAM, PERSONAL, hoàn thành không cần duyệt, lời mời, chuyển thành OFFICIAL | P1 · 09 | `POST /api/tasks` (TEAM/PERSONAL), `POST /api/tasks/:id/complete`, `/invitations/:participantId/respond`, `/convert-official`; `DELETE /api/tasks/:id` chỉ PERSONAL | `/personal-tasks`, `/tasks`, `/tasks/:id` | BE+FE | UI/mock đã có; chưa mở trong API P0 |
| Dự án, lịch, dashboard dự án | P1 · 09 | `GET/POST /api/projects`, `GET/PATCH/DELETE /api/projects/:id`, `GET /api/calendar` | `/projects`, `/projects/:id`, `/calendar` | BE+FE | UI/mock đã có; chưa mở trong API P0 |
| Việc con tối đa 2 cấp | P1 · 09 | `POST /api/tasks/:id/subtasks` | `/tasks/:id` | BE+FE | UI/mock đã có; chưa mở trong API P0 |
| Đề nghị gia hạn/đổi chủ trì và quyết định | P1 · 09 | `POST /api/tasks/:id/deadline-requests`, `/deadline-requests/:requestId/decision`, `/assignee-requests`, `/assignee-requests/:requestId/decision` | `/tasks/:id`, `/approvals` | BE+FE | UI/mock đã có; D-11 giữ P1 |
| Mẫu/kỳ định kỳ, sinh việc và nộp theo luồng chung | P1 · 09 | `/api/recurrence-rules`, `/api/recurrence-instances`; nộp tại `POST /api/tasks/:id/submissions` | `/recurrence`, `/tasks/:id` | BE+FE | UI/mock đã có; chưa mở trong API P0 |
| Chat 1–1/nhóm, chưa đọc, file chat | P1 · 09 | `/api/chat/rooms`, `/api/chat/rooms/:id/messages`, `/api/chat/rooms/:id/read`; file theo MESSAGE | `/chat` | BE+FE | UI/mock đã có; chưa mở trong API P0 |
| Tìm kiếm nâng cao theo project và cộng tác | P1 · 09 | `GET /api/tasks` (filter mở rộng) | `/tasks`, `/projects/:id` | BE+FE | UI/mock đã có; nối sau Phase 09 |
| Phê duyệt nhiều bước, Gantt/phụ thuộc, Lark Base, tài liệu cộng tác, AI | P2 · backlog | Chưa định nghĩa | Chưa có route chuẩn | Product+BE+FE | Chưa mở |
| Email/Zalo và scale ngang/queue | P2 · backlog | Chưa định nghĩa | Chưa có route chuẩn | Product+BE | Chưa mở |

`/ui-kit` và thanh công cụ dev là công cụ prototype FE, không nằm trong API nghiệp vụ. P0 có thể để route P1 hiện hữu nhưng không được trình bày như dữ liệu thật. Màn `/approvals` có cả submission P0 và request P1; khi nối P0, phần request P1 cần feature gate riêng. Tương tự, `/tasks/:id` có các điều khiển P1 trong route P0.

## Cổng bàn giao Phase 08

1. Route P0 dùng `HttpRepository`, không giữ thành công giả từ mock khi triển khai thật.
2. Mọi route/điều khiển P1 còn mock hiển thị nhãn và không trộn số liệu P1 vào KPI P0. `TEAM`/`PERSONAL` fixture chỉ phục vụ đối chiếu ACL tại Phase 03.
3. FE dùng ma trận [quyền](./PERMISSIONS.md) để ẩn/hiện hành động, BE vẫn là nơi quyết định quyền cuối cùng.
4. D-08 là cổng triển khai dữ liệu thật riêng, ghi trong [vận hành](./OPERATIONS.md).
