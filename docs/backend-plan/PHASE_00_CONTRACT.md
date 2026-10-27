# Phase 00 — Khóa hợp đồng nghiệp vụ và thiết kế BE

**Mục tiêu:** Có một nguồn quyết định rõ ràng trước khi viết migration, guard và endpoint.  
**Trạng thái:** Phase 00 hoàn thành ngày 27/10/2026 theo [bằng chứng nghiệm thu](./phase-00/ACCEPTANCE.md).  
**Đầu ra:** Decision log trong tài liệu này; [phạm vi/route](./phase-00/SCOPE.md), [ma trận quyền](./phase-00/PERMISSIONS.md), [REST contract](./phase-00/API_CONTRACT.md) và [OpenAPI v1](./phase-00/openapi.v1.json), [ERD/migration/time](./phase-00/DATA_MODEL.md) cùng [fixture clock cố định](./phase-00/kpi-fixture.v1.json), [vận hành](./phase-00/OPERATIONS.md) và [mẫu env](./phase-00/backend.env.example).  
**Cổng qua phase:** D-01 đến D-11 đã chốt; BE-00-01 đến BE-00-05 có đầu ra và đã đối chiếu nguồn. Điều kiện đơn vị chấp thuận dữ liệu thật ở D-08 là cổng riêng trước production.

## Task

### BE-00-01 — Chốt phạm vi và thứ tự ưu tiên

- **Phụ thuộc:** Không.
- **Thực hiện:** Lập danh sách endpoint/tính năng P0, P1, P2 từ đặc tả §13; ghép từng màn FE với tính năng BE và đánh dấu màn còn mock. P0 gồm auth/users, OFFICIAL lifecycle, comment, file, notification/reminder, dashboard/report, settings/audit/backup. P1 gồm dự án, lịch, TEAM/PERSONAL, yêu cầu gia hạn/đổi chủ trì (D-11), việc con, định kỳ và chat. Ghi rõ phần yêu cầu đã xuất hiện trên FE nhưng chưa mở trong P0.
- **Đầu ra:** Bảng scope có `feature`, `phase`, `endpoint`, `FE route`, `owner`, `trạng thái`.
- **Hoàn thành khi:** Không còn tính năng FE cần cho P0 bị xếp nhầm vào P1; P1 được phép chưa kết nối khi chốt P0 và được ghi rõ trên giao diện.

### BE-00-02 — Khóa ma trận quyền và state machine

- **Phụ thuộc:** BE-00-01.
- **Thực hiện:** Đối chiếu đặc tả §2 với §4/§15 (đoạn cũ ghi 2 vai trò/chỉ MANAGER), handoff §6.2 và FE `TaskService` (nhiều guard chỉ MANAGER). Viết bảng `role × action × task type × status × owner/participant` cho MANAGER, DEPUTY_MANAGER, STAFF. Tách quyền điều hành của Deputy và quyền quản trị hệ thống chỉ Manager. Định nghĩa ẩn thông tin với lời mời TEAM `PENDING`, DRAFT chỉ người tạo, PERSONAL chỉ chủ sở hữu, người cũ sau khi đổi chủ trì.
- **Đầu ra:** Ma trận quyền và sơ đồ transition có điều kiện, lý do bắt buộc, actor được phép.
- **Hoàn thành khi:** Mọi command của Phase 03/04 và endpoint quản trị Phase 02 có một dòng quyền tương ứng; bảng quyền áp dụng D-01 cho Deputy.

### BE-00-03 — Khóa REST contract và chuẩn lỗi

- **Phụ thuộc:** BE-00-02.
- **Thực hiện:** So khớp `data-contract.ts`, API mapping và handoff. Chọn đường dẫn duy nhất cho submit/approve/return, yêu cầu gia hạn/đổi chủ trì, dashboard, backup. Áp dụng response envelope, `Page<T>` và mã lỗi ở D-05; định nghĩa DTO và quy tắc `403` cho sai quyền, `404` cho ID không tồn tại, `409` khi state đổi. Sửa sai khác `TaskQuery.isOverdue` đang được FE dùng nhưng chưa có trong type và `sortBy=CREATED_AT` được handoff nêu nhưng type chưa có. Tạo OpenAPI có ví dụ request/response và danh mục event/socket.
- **Đầu ra:** OpenAPI versioned và bảng FE method → endpoint → DTO → response → lỗi.
- **Hoàn thành khi:** FE có thể tạo `HttpRepository` từ hợp đồng; không còn endpoint cùng nghiệp vụ nhưng khác tên/shape mà chưa có quyết định.

### BE-00-04 — Khóa dữ liệu, thời gian và fixture

- **Phụ thuộc:** BE-00-02.
- **Thực hiện:** Thiết kế Prisma schema theo D-04: ID UUID do server sinh, mã `CV/NH/CN` có bộ đếm nguyên tử theo năm, unique/index và migration. Giữ `Task`, `TaskParticipant`, `TaskSubmission`, `TaskApproval`, `TaskDeadlineRequest`, `TaskAssigneeRequest`, `TaskEvent` tách riêng. Định nghĩa ISO UTC qua API, `Asia/Ho_Chi_Minh` khi nhập hạn chỉ có ngày, `defaultDueHour`, `dueAt` và snapshot hạn để tính đúng hạn sau gia hạn. Seed BE dùng clock cố định để tái hiện `t01`–`t17`; không phụ thuộc thời điểm chạy như seed demo FE.
- **Đầu ra:** ERD có ràng buộc, quy ước timestamp, fixture và bảng KPI kỳ vọng.
- **Hoàn thành khi:** Hai bộ KPI 7 và 11 việc từ handoff §9.4 có cùng công thức; mọi quan hệ/file link có đường kiểm tra quyền.

### BE-00-05 — Chốt quyết định vận hành và an toàn

- **Phụ thuộc:** BE-00-01.
- **Thực hiện:** Triển khai các quyết định D-02 đến D-11 bên dưới vào cấu hình mẫu, checklist triển khai và tài liệu vận hành. Điều kiện được đơn vị chấp thuận dùng dữ liệu thật trên cloud ở D-08 phải được xác minh trước production.
- **Đầu ra:** Decision log, bản nháp cấu hình môi trường, checklist triển khai dữ liệu thật.
- **Hoàn thành khi:** Không có giá trị bí mật hoặc địa chỉ hạ tầng thật trong repo; môi trường staging dùng dữ liệu giả, còn production có cổng kiểm tra chấp thuận dữ liệu thật.

## Decision log đã chốt

**Người chốt:** Người dùng, qua trao đổi ngày 27/10/2026. **Trạng thái:** D-01 đến D-11 đã chốt cho kế hoạch BE; đầu ra các task Phase 00 đã nghiệm thu tại [ACCEPTANCE.md](./phase-00/ACCEPTANCE.md).

| Mã | Quyết định chính thức | Áp dụng vào |
|---|---|---|
| D-01 | Có 3 vai trò `MANAGER`, `DEPUTY_MANAGER`, `STAFF`. Deputy có đầy đủ quyền điều hành OFFICIAL như Manager, nhưng không quản lý tài khoản, settings, audit hoặc backup. Không tạo vai trò ADMIN riêng. | RBAC/ACL Phase 02–04, 07–09; thay thế đoạn cũ trong PRD §4/§15 và guard MANAGER-only của prototype FE. |
| D-02 | P0 đăng nhập bằng email công vụ và mật khẩu nội bộ. SSO chỉ triển khai khi đơn vị cung cấp hệ thống/yêu cầu tích hợp. | Auth Phase 02. |
| D-03 | Access token sống 15 phút; refresh token xoay vòng trong cookie `HttpOnly`, `Secure`, sống 7 ngày. Có logout từng phiên và mọi thiết bị. | Auth/session Phase 02; FE adapter Phase 08. |
| D-04 | Dùng Prisma. ID bản ghi là UUID do server sinh; mã nghiệp vụ `CV-YYYY-...`, `NH-YYYY-...`, `CN-YYYY-...` dùng bộ đếm nguyên tử trong DB để không trùng khi tạo đồng thời. | Prisma schema, migration, command tạo task Phase 01/03. |
| D-05 | Một OpenAPI làm chuẩn. Thành công trả `{data: ...}`, lỗi trả `{error: {code, message, fieldErrors?}}`; trang danh sách đặt `Page<T>` trong `data`. HTTP 400 dữ liệu sai, 401 chưa xác thực, 403 sai quyền, 404 ID không tồn tại, 409 xung đột trạng thái. | Contract Phase 00, API BE và HttpRepository FE. |
| D-06 | R2 private bucket. Khi gỡ liên kết file, đánh dấu `REMOVED` và chặn tải; chỉ xóa object không còn liên kết hợp lệ sau 90 ngày, trừ hồ sơ có yêu cầu lưu lâu hơn của đơn vị. | Files/cleanup Phase 05. |
| D-07 | P0 chỉ thông báo trong ứng dụng và realtime. Email/Zalo thuộc giai đoạn sau. | Notifications Phase 06; scope P0/P2. |
| D-08 | Backup PostgreSQL hằng ngày, mã hóa, lưu tại private bucket riêng với DB chính; giữ 30 ngày và thử khôi phục mỗi tháng. Staging dùng dữ liệu giả. Dữ liệu nghiệp vụ thật chỉ lên cloud sau khi đơn vị chấp thuận. | Backup Phase 07; cổng production Phase 08. |
| D-09 | Mở lại phải có lý do. `DONE → IN_PROGRESS`; `CANCELLED → TODO` nếu chưa bắt đầu, hoặc `IN_PROGRESS` nếu đã bắt đầu. Giữ mọi submission/approval/event cũ; xóa dấu hoàn thành hiện tại để lần nộp mới được xét riêng. | Workflow Phase 04. |
| D-10 | File upload trước khi nộp được gắn tạm với TASK để kiểm tra quyền; chỉ liên kết với SUBMISSION khi gửi duyệt. BE dùng `UPLOADING`, `READY`, `REMOVED` và dọn file tạm bỏ dở. | Contract/files Phase 00/05, submission Phase 04. |
| D-11 | Yêu cầu gia hạn và đổi chủ trì ở P1. Màn FE đã có sẽ chỉ bật với API thật khi hoàn thành Phase 09. | Scope và FE integration Phase 00/08/09. |

**Điều kiện triển khai còn phải kiểm chứng:** D-08 không thay thế sự chấp thuận của đơn vị đối với dữ liệu thật; BE-08-04 phải có bằng chứng chấp thuận trước khi nạp dữ liệu nghiệp vụ lên production.

## Ca đối chiếu bắt buộc

- `t01`–`t09`: `OFFICIAL` hợp lệ **7**, `TODO 2`, `IN_PROGRESS 2`, `IN_REVIEW 1`, `DONE 2`, quá hạn **1**, đúng hạn **1/2**; `t07` DRAFT và `t08` CANCELLED nằm ngoài KPI chính.
- `t01`–`t17`: `OFFICIAL` hợp lệ **11**, `TODO 5`, `IN_PROGRESS 2`, `IN_REVIEW 2`, `DONE 2`, quá hạn **1**.
- Staff B không xem `PERSONAL` của Staff A; Manager cũng không mặc nhiên xem. Người được mời TEAM ở `PENDING` chỉ xem thông tin lời mời giới hạn.
