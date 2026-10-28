# Theo dõi triển khai Backend

Checkbox chỉ đánh dấu sau khi task đạt mục **Hoàn thành khi** trong file phase và có đường dẫn tới PR/bằng chứng nghiệm thu. Phase 00–06 đã có bằng chứng nghiệm thu trong thư mục `phase-00` đến `phase-06`; workflow Phase 04, file lifecycle Phase 05 và notification Phase 06 đều qua runtime matrix trên DB disposable. Phase 07 BE-01 đến BE-04 đã triển khai và qua nghiệm thu local; phép đo tài nguyên staging BE-05 còn chờ. Phase 08 BE-01 đến BE-03 đã qua nghiệm thu local; staging/production BE-04 và Phase 09 còn chờ.

Các quyết định D-01 đến D-11 đã được người dùng chốt trong [Phase 00](./PHASE_00_CONTRACT.md). Cổng chấp thuận dữ liệu thật D-08 vẫn thuộc BE-08-04.

## Phase 00 — [Hợp đồng](./PHASE_00_CONTRACT.md)

- [x] BE-00-01 — [Phạm vi P0/P1/P2 và bảng route/endpoint](./phase-00/SCOPE.md); [nghiệm thu](./phase-00/ACCEPTANCE.md).
- [x] BE-00-02 — [Ma trận 3 vai trò và state machine](./phase-00/PERMISSIONS.md); [nghiệm thu](./phase-00/ACCEPTANCE.md).
- [x] BE-00-03 — [OpenAPI, DTO, lỗi, query và socket contract](./phase-00/API_CONTRACT.md); [nghiệm thu](./phase-00/ACCEPTANCE.md).
- [x] BE-00-04 — [ERD, thời gian, clock và fixture](./phase-00/DATA_MODEL.md); [nghiệm thu](./phase-00/ACCEPTANCE.md).
- [x] BE-00-05 — [Decision log D-01 đến D-11](./PHASE_00_CONTRACT.md) và [vận hành](./phase-00/OPERATIONS.md); [nghiệm thu](./phase-00/ACCEPTANCE.md).

## Phase 01 — [Nền tảng](./PHASE_01_FOUNDATION.md)

- [x] BE-01-01 — NestJS app, module và README; [bằng chứng](./phase-01/ACCEPTANCE.md).
- [x] BE-01-02 — Runtime config, bảo mật HTTP và logging; [bằng chứng](./phase-01/ACCEPTANCE.md).
- [x] BE-01-03 — Migration PostgreSQL lõi; [bằng chứng](./phase-01/ACCEPTANCE.md).
- [x] BE-01-04 — Seed P0 có clock kiểm soát được; [bằng chứng](./phase-01/ACCEPTANCE.md).
- [x] BE-01-05 — CI và quy trình migration; [bằng chứng](./phase-01/ACCEPTANCE.md).

## Phase 02 — [Auth và users](./PHASE_02_AUTH_USERS.md)

- [x] BE-02-01 — Login/refresh/logout/logout-all; code trong `Server/src/modules/auth`; [runtime acceptance](./phase-02/ACCEPTANCE.md).
- [x] BE-02-02 — RBAC và ACL dùng chung; guard/policy trong `Server/src/common/auth`; [runtime acceptance](./phase-02/ACCEPTANCE.md).
- [x] BE-02-03 — Hồ sơ, danh bạ và workload; code trong `Server/src/modules/auth` và `Server/src/modules/users`; [runtime acceptance](./phase-02/ACCEPTANCE.md).
- [x] BE-02-04 — Quản trị user chỉ MANAGER; code trong `Server/src/modules/users`; [runtime acceptance](./phase-02/ACCEPTANCE.md).
- [x] BE-02-05 — [Ma trận kiểm tra phiên và quyền](./phase-02/ACCEPTANCE.md); PASS trên DB scratch.

## Phase 03 — [Task core](./PHASE_03_TASK_CORE.md)

- [x] BE-03-01 — Task policy và query scoped; [runtime acceptance](./phase-03/ACCEPTANCE.md).
- [x] BE-03-02 — Tạo task, participant, mã nghiệp vụ; [runtime acceptance](./phase-03/ACCEPTANCE.md).
- [x] BE-03-03 — List/search/sort/page/detail; [runtime acceptance](./phase-03/ACCEPTANCE.md).
- [x] BE-03-04 — Sửa metadata và bình luận; [runtime acceptance](./phase-03/ACCEPTANCE.md).
- [x] BE-03-05 — Nghiệm thu ACL task; [runtime acceptance](./phase-03/ACCEPTANCE.md).

## Phase 04 — [Workflow OFFICIAL](./PHASE_04_OFFICIAL_WORKFLOW.md)

- [x] BE-04-01 — Publish/start/progress/blocked.
- [x] BE-04-02 — Submit/withdraw và lịch sử nộp.
- [x] BE-04-03 — Approve/return.
- [x] BE-04-04 — Đổi hạn/chủ trì, cancel/reopen.
- [x] BE-04-05 — Transaction, idempotency và task events.
- [x] BE-04-06 — Nghiệm thu journey OFFICIAL.

## Phase 05 — [R2 files](./PHASE_05_FILES.md)

- [x] BE-05-01 — Storage model, R2 và CORS.
- [x] BE-05-02 — Signed PUT URL.
- [x] BE-05-03 — Complete/verify/file link.
- [x] BE-05-04 — Signed GET/list/remove/cleanup.
- [x] BE-05-05 — Nghiệm thu file và lỗi R2.

## Phase 06 — [Notifications](./PHASE_06_NOTIFICATIONS.md)

- [x] BE-06-01 — Notification API và recipient matrix; [runtime acceptance](./phase-06/ACCEPTANCE.md).
- [x] BE-06-02 — Transaction/outbox/socket; [runtime acceptance](./phase-06/ACCEPTANCE.md).
- [x] BE-06-03 — Scheduler nhắc hạn chống trùng; [runtime acceptance](./phase-06/ACCEPTANCE.md).
- [x] BE-06-04 — Reconnect và trạng thái đọc; [runtime acceptance](./phase-06/ACCEPTANCE.md).
- [x] BE-06-05 — Nghiệm thu thông báo; [runtime acceptance](./phase-06/ACCEPTANCE.md).

## Phase 07 — [Báo cáo và vận hành](./PHASE_07_REPORTS_OPERATIONS.md)

- [x] BE-07-01 — Dashboard KPI theo vai trò; fixed-clock acceptance [PASS](./phase-07/ACCEPTANCE.md).
- [x] BE-07-02 — Reports và CSV/XLSX; runtime acceptance [PASS](./phase-07/ACCEPTANCE.md).
- [x] BE-07-03 — Settings và audit quản trị; RBAC, redaction và append-only [PASS](./phase-07/ACCEPTANCE.md).
- [x] BE-07-04 — Backup mã hóa, restore cô lập và retention [local PASS](./phase-07/ACCEPTANCE.md); cần xác nhận S3 staging ở BE-08-04.
- [ ] BE-07-05 — Metrics/log có KPI p95 cửa sổ 512 mẫu, CPU/DB connection limit và request ID nối task event → notification; đã đo local với 50 request/concurrency 20 trên 50.000 task synthetic (KPI p95 74 ms, 20/100 DB connections). Còn xác nhận alert và đo trên staging/Railway; hoãn theo yêu cầu. Xem [runbook](./phase-07/RUNBOOK.md) và [kết quả hiện có](./phase-07/ACCEPTANCE.md).

## Phase 08 — [Kết nối FE và P0](./PHASE_08_INTEGRATION_RELEASE.md)

- [x] BE-08-01 — Repository interface/HTTP adapter, auth FE; [route matrix và acceptance](./phase-08/ROUTE_MATRIX.md).
- [x] BE-08-02 — Nối route P0 và trạng thái lỗi; [route matrix và acceptance](./phase-08/ROUTE_MATRIX.md).
- [x] BE-08-03 — Contract và journey nghiệm thu; [biên bản local PASS](./phase-08/ACCEPTANCE.md).
- [ ] BE-08-04 — Staging, production và runbook.

## Phase 09 — [P1 collaboration](./PHASE_09_P1_COLLABORATION.md)

- [ ] BE-09-01 — TEAM/PERSONAL/invitation/convert.
- [ ] BE-09-02 — Projects và calendar.
- [ ] BE-09-03 — Subtask và yêu cầu gia hạn/đổi chủ trì.
- [ ] BE-09-04 — Recurrence.
- [ ] BE-09-05 — Chat và file chat.
- [ ] BE-09-06 — Nghiệm thu P1 và regression P0.
