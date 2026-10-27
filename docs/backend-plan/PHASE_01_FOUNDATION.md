# Phase 01 — Nền tảng NestJS và PostgreSQL

**Phụ thuộc:** Phase 00 khóa mô hình lõi, ORM và quy ước API.  
**Mục tiêu:** Có backend có thể dựng lại từ repo trên máy mới và một DB migration/seed lặp lại được.  
**Cổng qua phase:** API health chạy, migration từ DB rỗng thành công, seed fixture không nhân đôi khi chạy lại, tài liệu môi trường đủ để khởi động local.

## Task

### BE-01-01 — Khởi tạo ứng dụng và module boundaries

- **Phụ thuộc:** BE-00-01, BE-00-04.
- **Thực hiện:** Dựng NestJS TypeScript trong `Server/`, quản lý package lock, script dev/build/migrate/seed. Tạo module `auth`, `users`, `tasks`, `files`, `notifications`, `reminders`, `dashboard/reports`, `settings`, `audit`; để module P1 sau. Tách controller, application service, repository/DB, policy; không đưa quy tắc ACL vào controller rời rạc.
- **Đầu ra:** App khởi động và `Server/README.md` có cách chạy cùng sơ đồ module.
- **Hoàn thành khi:** Build qua, health endpoint trả trạng thái app và DB theo chuẩn đã chốt; startup báo lỗi cấu hình thiếu rõ ràng.

### BE-01-02 — Cấu hình runtime, bảo mật HTTP và quan sát

- **Phụ thuộc:** BE-01-01.
- **Thực hiện:** Validate env cho DB, auth, CORS, R2, timezone, giới hạn file và scheduler; chia local/staging/production. Bật validation DTO toàn cục, allowlist trường, chuẩn lỗi, request ID, structured logging không ghi mật khẩu/token/signed URL. Thiết lập CORS theo origin FE, security headers, graceful shutdown, readiness/liveness và rate limit cơ sở.
- **Đầu ra:** `.env.example` không chứa secret, config module, health/logging/error filter.
- **Hoàn thành khi:** Cấu hình sai thất bại sớm; log có request ID nhưng không lộ bí mật; app tắt kết nối DB sạch.

### BE-01-03 — Migration dữ liệu lõi

- **Phụ thuộc:** BE-00-04, BE-01-01.
- **Thực hiện:** Dùng Prisma theo D-04. Tạo bảng `users`, `auth_sessions`, `app_settings`, `projects` (để giữ FK `tasks.projectId`), `tasks`, `task_participants`, `task_comments`, `task_submissions`, `task_approvals`, `task_deadline_requests`, `task_assignee_requests`, `task_events`, `notifications`, `reminder_events`, `files`, `file_links`; bảng recurrence/chat P1 tách migration sau. ID bản ghi là UUID server sinh; mã nghiệp vụ có bộ đếm nguyên tử trong DB. Có FK, unique email case-insensitive, unique participant, trạng thái hợp lệ, chỉ mục lọc task/notification và key chống trùng nhắc hạn. Event/submission/approval là lịch sử append-only. Rà DDL handoff như đề xuất, không sao chép nguyên khi ràng buộc hoặc kiểu dữ liệu chưa khớp contract.
- **Đầu ra:** Migration có thứ tự, ERD cập nhật, hướng dẫn tạo DB rỗng.
- **Hoàn thành khi:** Migration chạy trên DB rỗng và DB đã có phiên bản trước; không có bảng chứa bytes file hay mật khẩu thô.

### BE-01-04 — Seed, fixture và đồng hồ kiểm soát được

- **Phụ thuộc:** BE-01-03.
- **Thực hiện:** Tạo seed demo riêng khỏi dữ liệu production. Fixture P0 ánh xạ `u01`–`u06`, `t01`–`t13` và quan hệ thuộc bảng đã có; `t10`–`t13` dùng để kiểm tra ACL dù chức năng tạo TEAM/PERSONAL thuộc P1. Fixture mở rộng `rr01`, `rr02`, `ri01`, `t14`–`t17` được thêm khi có migration recurrence ở Phase 09. Dùng thời điểm tham chiếu cố định hoặc injected clock để KPI không trôi theo ngày chạy. Hash mật khẩu mẫu và không dùng mật khẩu đó ở production. Seed có cơ chế idempotent, tên môi trường rõ ràng.
- **Đầu ra:** Lệnh seed/clean cho DB phát triển, mô tả clock và bảng expected KPI.
- **Hoàn thành khi:** Chạy seed lần hai không tăng số bản ghi; fixture truy vấn ra đúng loại/trạng thái và quan hệ đã công bố.

### BE-01-05 — CI và chất lượng cơ bản

- **Phụ thuộc:** BE-01-01 đến BE-01-04.
- **Thực hiện:** Thiết lập format/lint/typecheck/build và migration check trong CI. Chuẩn bị DB tạm cho kiểm tra tích hợp; quản lý biến môi trường CI; cấm commit secret. Viết hướng dẫn review migration: thay đổi schema, tương thích dữ liệu, kế hoạch khôi phục.
- **Đầu ra:** Pipeline xanh trên nhánh BE với cache/dependency ổn định.
- **Hoàn thành khi:** Một checkout mới có thể cài, dựng DB, migrate, seed và build theo README; pipeline báo lỗi tại bước cụ thể.
