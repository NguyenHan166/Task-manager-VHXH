# Phase 08 — Ma trận route FE/API

Phạm vi này chạy với `VITE_DATA_MODE=api`; `workspaceRepository` chọn `HttpRepository`, phiên đăng nhập do API cấp và mỗi truy vấn dữ liệu đi qua API có ACL. `ApiClient` tự refresh một lần khi nhận 401, kết thúc phiên nếu refresh thất bại, đọc envelope lỗi chuẩn và chuyển 403/404/409/validation thành `ApiError`. Màn hình hiển thị lỗi bằng thông báo/trạng thái cấm truy cập; không đổi mutation thất bại thành thành công.

| FE route | API/đường dữ liệu chính | Quyền và trạng thái |
|---|---|---|
| `/login` và mọi route cần phiên | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me` | Chỉ nhận phiên ACTIVE từ server; refresh cookie và access token cấp bởi API. Hết phiên sẽ trở về đăng nhập. |
| `/dashboard` | `GET /dashboard/stats?scope=DEPT|STAFF`, `GET /users/:id/workload`, thông báo chưa đọc | API trả phạm vi KPI theo vai trò; số liệu dashboard dùng dữ liệu OFFICIAL P0. |
| `/tasks` | `GET /tasks` với filter, sort, page và `pageSize`; danh bạ qua `GET /users` khi cần | ACL được áp dụng ở API trước khi phân trang. Không đưa task người khác vào danh sách. |
| `/tasks/create` | `POST /tasks`, tiếp theo `POST /tasks/:id/publish` nếu tạo để giao ngay | MANAGER/DEPUTY_MANAGER được tạo OFFICIAL. Nháp giữ DRAFT; STAFF ở API mode thấy thông báo tính năng P1 chưa mở. |
| `/tasks/:id` | `GET /tasks/:id`, `/events`, `/comments`, `/submissions`, `/approvals`; mutation publish/start/progress/adjust/cancel/reopen/submit/withdraw/approve/return; upload file theo TASK hoặc COMMENT | Quyền đọc và chuyển trạng thái do API quyết định. Người không có quyền nhận 404/403 theo contract; lịch sử và tệp sau mutation được tải lại. |
| `/approvals` | Task `IN_REVIEW`, submissions/approvals, `POST /tasks/:id/approve` hoặc `/return` | MANAGER/DEPUTY_MANAGER xử lý submission. Đề nghị gia hạn/đổi chủ trì là P1 theo D-11 và bị chặn trong API mode. |
| `/notifications` và chuông dùng chung | `GET /notifications`, `/notifications/unread-count`, `POST /notifications/:id/read`, `/read-all`; Socket.IO chỉ kích hoạt đồng bộ lại REST | API giới hạn theo người nhận; số chưa đọc cập nhật sau thao tác đọc. |
| `/files` | `GET /files`; `POST /files/upload-url`, signed `PUT`, `POST /files/complete`; `GET /files/:id/download-url`; `DELETE /files/:id` | File riêng tư R2; quyền theo task/comment/submission. Task detail tải được tệp liên kết TASK và COMMENT; tab submission dùng `fileIds`. |
| `/reports` | `GET /reports/kpi`, `/reports/tasks`, `/reports/tasks/export` | Scope theo vai trò; filter và phân trang do server xử lý; export dùng endpoint CSV/XLSX. |
| `/members` | `GET /users`, `/users/:id/workload`; MANAGER có `POST /users`, `PATCH /users/:id`, `POST /users/:id/reset-password` | Danh bạ có projection theo vai trò; thao tác quản trị bị API chặn nếu không phải MANAGER. |
| `/profile` | `GET/PATCH /auth/me`, `POST /auth/change-password` | Chỉ thay đổi hồ sơ phiên hiện tại. |
| `/settings` | MANAGER: `GET/PATCH /settings`, `GET /audit-logs`, `GET /backup` | API bảo vệ settings, audit và backup metadata ở vai trò MANAGER; thay đổi cấu hình có audit. |

`/personal-tasks`, `/projects`, `/projects/:id`, `/calendar`, `/recurrence`, `/chat` và các điều khiển P1 còn lại được đặt sau `MockOnlyRoute`/feature gate. Chúng chưa được tính vào API P0; fixture hiện không có task PERSONAL. `/ui-kit` là công cụ prototype, không thuộc API nghiệp vụ.

Kiểm tra tích hợp: `Frontend/scripts/check-phase08.mjs` tải chính `HttpRepository` qua Vite SSR, so sánh các operation/DTO với OpenAPI và gọi API thật cho journey, quyền, lỗi, KPI, audit, settings và tệp COMMENT. Kết quả: [biên bản nghiệm thu](./ACCEPTANCE.md).
