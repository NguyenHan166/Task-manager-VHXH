# Phase 03 — Task core và ma trận nghiệm thu

**Trạng thái:** Hoàn thành BE-03-01 đến BE-03-05 trên nhánh `codex/phase-03-task-core`. API được chạy với PostgreSQL 16 scratch riêng (`127.0.0.1:5434`) và HTTP ở `127.0.0.1:3010`; migration và seed P0 được áp dụng trước khi kiểm tra. Database làm việc ở cổng 5433 không bị sửa. Ma trận tự động ở [`Server/scripts/check-tasks.ts`](../../../Server/scripts/check-tasks.ts), gọi bằng `npm run tasks:check` và chỉ chấp nhận API localhost. CI chạy ma trận này sau migration, seed và kiểm tra fixture.

## Endpoint và chính sách

- `GET /api/tasks`: ACL ở điều kiện truy vấn DB trước `count`, filter, search và phân trang. Có `scope`, `type`, `status`, `priority`, `projectId`, `primaryAssigneeId`, `search`, `dueFrom/dueTo`, `isOverdue`, bốn kiểu sort, chiều sort, `page` và `pageSize` tối đa 100. Sort có `id` làm tie-breaker; hạn rỗng luôn cuối. Ví dụ: `/api/tasks?scope=OWNED&status=IN_PROGRESS&sortBy=DUE_AT&sortDirection=ASC&page=1&pageSize=10`.
- `GET /api/tasks/:id`: cùng ACL, trả task, participants, READY files đang liên kết, latest submission và bốn history counts. Ẩn `archivedAt`/R2 `objectKey`. `GET /comments` và `GET /events` có phân trang riêng và cùng ACL.
- `POST /api/tasks`: MANAGER/DEPUTY_MANAGER tạo OFFICIAL DRAFT; server tự sinh mã `CV-YYYY-NNNN`, creator, trạng thái và CREATED event. Kiểm tra người được gán/người tham gia ACTIVE, trùng lặp, `dueAt`/`dueDate`, và giới hạn P1. Task, participants, event và business-code counter trong transaction.
- `PATCH /api/tasks/:id`: người tạo là lãnh đạo sửa DRAFT, lãnh đạo sửa OFFICIAL đã phát hành còn hiệu lực. Trường hệ thống bị chặn; thay đổi priority sau publish đi qua `/adjust` ở Phase 04. Sửa có version guard và DETAILS_UPDATED event trong transaction.
- `POST /api/tasks/:id/comments`: người đọc được OFFICIAL đang hoạt động có thể gửi nội dung 1–4000 ký tự; server lấy author từ token, tăng version và ghi COMMENT_ADDED event trong transaction. DONE/CANCELLED vẫn đọc lịch sử nhưng không nhận bình luận mới.

## Ma trận fixture u01/u06/u02–u05 với t01–t13

| Người dùng | Task đọc được | Điều kiện nổi bật | Runtime |
|---|---|---|---|
| u01 MANAGER | t01–t09 | Chỉ thấy DRAFT t07 do mình tạo; không thấy TEAM/PERSONAL của nhân viên | PASS |
| u06 DEPUTY_MANAGER | t01–t06, t08–t09 | Không thấy DRAFT t07, TEAM/PERSONAL | PASS |
| u02 STAFF | t01, t02, t05, t09, t10, t12 | Chủ trì, cộng tác đã nhận, TEAM của mình, PERSONAL của mình | PASS |
| u03 STAFF | t01, t02, t06, t10, t11, t13 | Cộng tác đã nhận, TEAM của mình, PERSONAL của mình | PASS |
| u04 STAFF | t03, t04 | WATCHER t04; lời mời TEAM t11 đã từ chối không cấp quyền | PASS |
| u05 STAFF | t04, t08 | Lời mời TEAM t10 PENDING không cấp quyền | PASS |

Các tập task trên được tính từ fixture ở script, đối chiếu với `items` và `total` của API. ID không được đọc trả `404`; search theo mã, comments và events của task ẩn cũng không tiết lộ dữ liệu. PENDING projection giới hạn thuộc Phase 09 và chưa có API P0.

| Nhóm kiểm tra | Kỳ vọng | Runtime |
|---|---|---|
| Filter `scope/type/status/priority/projectId/primaryAssigneeId/dueFrom/dueTo/isOverdue`; ngày đảo, page sai | Total đúng trong ACL; input sai `400` | PASS |
| Sort và phân trang | Hai trang ghép khớp một trang lớn; ID không lặp; hạn `null` cuối ở ASC/DESC | PASS |
| Task detail có submission/file/approval fixture | `t02` và `t05` có counts, file IDs, không trả `objectKey` | PASS |
| Tạo DRAFT và tạo đồng thời | Assignee/collaborator/watcher không thấy nháp; mã `CV` không trùng; event/participants lưu cùng task | PASS |
| Tạo/sửa không hợp lệ | STAFF `403`; TEAM/PERSONAL/project/parent và trường hệ thống bị chặn; DONE/CANCELLED sửa `409` | PASS |
| Bình luận và sự kiện | Chỉ người có quyền; nội dung rỗng/dài quá `4000` bị chặn; author từ token; COMMENT_ADDED/DETAILS_UPDATED hiện trong lịch sử; comment còn đọc được sau khi đổi trạng thái trực tiếp trên DB scratch | PASS |
| Task đã archive | Không hiện trong detail sau khi đặt `archivedAt` trên DB scratch | PASS |
| Phiên bị khóa và phase gate | Token của user LOCKED `401`; publish Phase 04, complete Phase 09 trả `404` | PASS |

Static checks `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build` đều PASS. OpenAPI được sinh lại từ `build_openapi.py`; data contract FE bổ sung hai event kind mới.

## Ranh giới phase

TEAM/PERSONAL, project/parent write và lời mời PENDING mở trong Phase 09. Publish, status, deadline/assignee adjustments, submission và approval mở trong Phase 04. Notification recipient matrix/outbox/socket thuộc Phase 06; Phase 03 ghi TaskEvent bền nhưng chưa phát notification. File upload/download R2 thuộc Phase 05. Các module sau phải dùng chung task ACL khi truy vấn quan hệ. Hành trình đổi trạng thái bằng API thực tế được nghiệm thu cùng Phase 04.
