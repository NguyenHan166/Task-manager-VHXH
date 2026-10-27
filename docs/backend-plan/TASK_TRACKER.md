# Theo dõi triển khai Backend

Checkbox chỉ đánh dấu sau khi task đạt mục **Hoàn thành khi** trong file phase và có đường dẫn tới PR/bằng chứng nghiệm thu. Phase 00 đã có [bằng chứng đối chiếu](./phase-00/ACCEPTANCE.md); Phase 01 đã có [bằng chứng local và CI](./phase-01/ACCEPTANCE.md). Các phase 02–09 chưa bắt đầu. Task có thể triển khai song song khi các phụ thuộc ở từng phase đã xong.

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

- [ ] BE-02-01 — Login/refresh/logout/logout-all.
- [ ] BE-02-02 — RBAC và ACL dùng chung.
- [ ] BE-02-03 — Hồ sơ và danh bạ người dùng.
- [ ] BE-02-04 — Quản trị user chỉ MANAGER.
- [ ] BE-02-05 — Ma trận kiểm tra phiên và quyền.

## Phase 03 — [Task core](./PHASE_03_TASK_CORE.md)

- [ ] BE-03-01 — Task policy và query scoped.
- [ ] BE-03-02 — Tạo task, participant, mã nghiệp vụ.
- [ ] BE-03-03 — List/search/sort/page/detail.
- [ ] BE-03-04 — Sửa metadata và bình luận.
- [ ] BE-03-05 — Nghiệm thu ACL task.

## Phase 04 — [Workflow OFFICIAL](./PHASE_04_OFFICIAL_WORKFLOW.md)

- [ ] BE-04-01 — Publish/start/progress/blocked.
- [ ] BE-04-02 — Submit/withdraw và lịch sử nộp.
- [ ] BE-04-03 — Approve/return.
- [ ] BE-04-04 — Đổi hạn/chủ trì, cancel/reopen.
- [ ] BE-04-05 — Transaction, idempotency và task events.
- [ ] BE-04-06 — Nghiệm thu journey OFFICIAL.

## Phase 05 — [R2 files](./PHASE_05_FILES.md)

- [ ] BE-05-01 — Storage model, R2 và CORS.
- [ ] BE-05-02 — Signed PUT URL.
- [ ] BE-05-03 — Complete/verify/file link.
- [ ] BE-05-04 — Signed GET/list/remove/cleanup.
- [ ] BE-05-05 — Nghiệm thu file và lỗi R2.

## Phase 06 — [Notifications](./PHASE_06_NOTIFICATIONS.md)

- [ ] BE-06-01 — Notification API và recipient matrix.
- [ ] BE-06-02 — Transaction/outbox/socket.
- [ ] BE-06-03 — Scheduler nhắc hạn chống trùng.
- [ ] BE-06-04 — Reconnect và trạng thái đọc.
- [ ] BE-06-05 — Nghiệm thu thông báo.

## Phase 07 — [Báo cáo và vận hành](./PHASE_07_REPORTS_OPERATIONS.md)

- [ ] BE-07-01 — Dashboard KPI theo vai trò.
- [ ] BE-07-02 — Reports và CSV/XLSX.
- [ ] BE-07-03 — Settings và audit quản trị.
- [ ] BE-07-04 — Backup, restore, retention.
- [ ] BE-07-05 — Metrics, log và tài nguyên.

## Phase 08 — [Kết nối FE và P0](./PHASE_08_INTEGRATION_RELEASE.md)

- [ ] BE-08-01 — Repository interface/HTTP adapter, auth FE.
- [ ] BE-08-02 — Nối route P0 và trạng thái lỗi.
- [ ] BE-08-03 — Contract và journey nghiệm thu.
- [ ] BE-08-04 — Staging, production và runbook.

## Phase 09 — [P1 collaboration](./PHASE_09_P1_COLLABORATION.md)

- [ ] BE-09-01 — TEAM/PERSONAL/invitation/convert.
- [ ] BE-09-02 — Projects và calendar.
- [ ] BE-09-03 — Subtask và yêu cầu gia hạn/đổi chủ trì.
- [ ] BE-09-04 — Recurrence.
- [ ] BE-09-05 — Chat và file chat.
- [ ] BE-09-06 — Nghiệm thu P1 và regression P0.
