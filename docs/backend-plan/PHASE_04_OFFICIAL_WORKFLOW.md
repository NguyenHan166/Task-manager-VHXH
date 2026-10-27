# Phase 04 — Vòng đời nhiệm vụ chính thức

**Phụ thuộc:** Phase 03; ma trận trạng thái Phase 00.  
**Mục tiêu:** Một nhiệm vụ OFFICIAL đi hết chuỗi DRAFT → TODO → IN_PROGRESS → IN_REVIEW → DONE hoặc RETURNED → IN_PROGRESS, bảo toàn mọi lần nộp và quyết định.  
**Cổng qua phase:** u01/u06 có quyền điều hành đã chốt; u02 chủ trì hoàn thành luồng; mọi thao tác sai quyền/sai trạng thái bị từ chối và không để lại dữ liệu nửa chừng.

## Nguyên tắc giao dịch

Mỗi command đổi trạng thái phải kiểm tra trạng thái hiện tại trong transaction, cập nhật `tasks`, thêm bản ghi lịch sử (`task_events`, `task_submissions`, `task_approvals` khi phù hợp) và tạo `notifications`/outbox theo người nhận. Socket chỉ phát sau commit ở Phase 06. `createdById`, `submittedById`, `approvedById`, mốc thời gian và trạng thái do server quyết định.

## Task

### BE-04-01 — Phát hành, bắt đầu và tiến độ

- **Phụ thuộc:** BE-03-02, BE-02-02.
- **Thực hiện:** `POST /api/tasks/:id/publish` kiểm tra DRAFT, title/deliverable/chủ trì ACTIVE/dueAt hợp lệ, chuyển TODO, gán `assignedAt`, gửi thông báo đúng người. `POST /start` chỉ từ TODO và actor được quyền. `POST /progress` chỉ trong TODO/IN_PROGRESS, `progressPercent` nguyên 0–100, `isBlocked=true` phải có `blockedReason`; không tự DONE khi đạt 100%.
- **Đầu ra:** 3 command, event `PUBLISHED`, `STARTED`, `PROGRESS_UPDATED`, `BLOCKED/UNBLOCKED`.
- **Hoàn thành khi:** Publish hai lần không tạo thông báo/event trùng; STAFF khác không thể cập nhật; việc vướng mắc giữ nguyên status nghiệp vụ.

### BE-04-02 — Nộp và thu hồi kết quả

- **Phụ thuộc:** BE-04-01; tích hợp fileId READY khi Phase 05 hoàn tất.
- **Thực hiện:** `POST /api/tasks/:id/submissions` từ đúng chủ trì ở IN_PROGRESS, nhận `summary` bắt buộc, các trường kết quả và `fileIds` thuộc quyền; tạo bản ghi submission **mới** mỗi lần, chuyển IN_REVIEW, tiến độ 100, thông báo lãnh đạo. `POST .../withdraw` chỉ đúng người nộp, submission mới nhất còn PENDING và chưa có quyết định; đánh dấu WITHDRAWN, lưu lý do/thời gian, task về IN_PROGRESS và tiến độ theo quy tắc đã chốt (prototype dùng 90%).
- **Đầu ra:** Submission/withdraw API, liên kết tệp và lịch sử bất biến.
- **Hoàn thành khi:** Không ghi đè lần nộp cũ; không thu hồi sau khi duyệt/trả lại; hai yêu cầu thu hồi đồng thời chỉ một thành công.

### BE-04-03 — Duyệt và trả lại

- **Phụ thuộc:** BE-04-02.
- **Thực hiện:** `POST /api/tasks/:id/approve` và `/return` chỉ khi IN_REVIEW, chỉ MANAGER/DEPUTY_MANAGER theo D-01, trỏ đúng submission PENDING hiện hành. APPROVED tạo `TaskApproval`, đánh dấu submission APPROVED, task DONE, `completedAt`, `approvedById`, `approvedAt`; RETURNED bắt buộc lý do, giữ submission, task về IN_PROGRESS và báo chủ trì. Chốt cách tính đúng hạn tại thời điểm duyệt khi từng có gia hạn.
- **Đầu ra:** Approval records và event không thể sửa/xóa qua API thường.
- **Hoàn thành khi:** Hai lãnh đạo cùng quyết định chỉ một quyết định được ghi; kết quả trả lại nộp lại thành submission mới; event trước/sau đủ để truy vết.

### BE-04-04 — Điều chỉnh trực tiếp, hủy và mở lại

- **Phụ thuộc:** BE-04-01, BE-00-02.
- **Thực hiện:** Endpoint điều chỉnh hạn/chủ trì/priority sau giao yêu cầu lý do; lưu giá trị trước/sau, thông báo người cũ/mới, tính lại ACL. Hủy từ trạng thái được phép yêu cầu lý do, giữ lịch sử và ngừng nhắc hạn. Mở lại theo D-09: `DONE → IN_PROGRESS`; `CANCELLED → TODO` nếu chưa bắt đầu, hoặc `IN_PROGRESS` nếu đã bắt đầu. Giữ approval/submission/event cũ, xóa dấu hoàn thành hiện tại, yêu cầu lý do và ghi event mở lại; lần nộp kế tiếp tạo submission mới.
- **Đầu ra:** Commands điều chỉnh/cancel/reopen và quy tắc tái đánh giá reminder.
- **Hoàn thành khi:** Không đổi hạn/người qua PATCH tổng quát; lý do rỗng bị chặn; sau đổi chủ trì người cũ không còn quyền nếu không còn là participant.

### BE-04-05 — Tính nguyên tử và audit

- **Phụ thuộc:** BE-04-01 đến BE-04-04.
- **Thực hiện:** Áp dụng optimistic version hoặc khóa hàng khi xử lý state transition. Tạo `TaskEvent` append-only cho mọi thay đổi, actor lấy từ auth, before/after chỉ chứa trường cần thiết và không lộ bí mật. Xử lý retry/idempotency cho command nhạy cảm; lỗi giữa các bước phải rollback toàn bộ. Tách audit quản trị hệ thống ở Phase 07 với task timeline.
- **Đầu ra:** Transaction pattern, error `409`, idempotency strategy và event schema.
- **Hoàn thành khi:** Không có task DONE thiếu approval hay submission; không có notification/event cho transaction rollback; request lặp không sinh bản ghi lịch sử kép.

### BE-04-06 — Nghiệm thu kịch bản nhiệm vụ

- **Phụ thuộc:** BE-04-01 đến BE-04-05.
- **Thực hiện:** Đi luồng u01/u06 tạo → giao → u02 bắt đầu/tiến độ/nộp → thu hồi hoặc lãnh đạo trả lại/duyệt. Kiểm tra STAFF tự duyệt, người phối hợp nộp, đổi hạn trái quyền, hai người duyệt cùng lúc, DONE/CANCELLED không bị cập nhật tiến độ. Đối chiếu `t02`, `t05`, `t06`.
- **Đầu ra:** Bảng kịch bản và bằng chứng response/event/DB.
- **Hoàn thành khi:** Mọi transition đúng ma trận và trạng thái lỗi đã chốt.
