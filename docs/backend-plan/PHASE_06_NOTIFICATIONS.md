# Phase 06 — Thông báo, nhắc hạn và realtime

**Phụ thuộc:** Auth Phase 02, nghiệp vụ Phase 04.  
**Mục tiêu:** Thông báo là dữ liệu bền vững, đúng người nhận; cron và socket không tạo bản ghi trùng.  
**Cổng qua phase:** Online nhận cập nhật, offline tải lại qua API; job chạy lại hoặc server restart không làm nhân đôi một mốc nhắc.

## Task

### BE-06-01 — Notification model và API đọc

- **Phụ thuộc:** BE-04-05, D-07.
- **Thực hiện:** Định nghĩa mapping event nghiệp vụ → `Notification.type`, người nhận và payload tối thiểu. `GET /api/notifications` phân trang, `unreadOnly`, unread count; read-one/read-all chỉ cho recipient. Khi actor/chủ trì thay đổi, tính người nhận từ trạng thái đã commit. Notification liên kết task/chat nhưng endpoint không tiết lộ nội dung entity nếu quyền đã thay đổi.
- **Đầu ra:** Notification service, API và bảng recipient matrix.
- **Hoàn thành khi:** Không gửi cho người không liên quan; gọi read notification người khác bị chặn; dữ liệu còn sau đăng xuất hoặc restart.

### BE-06-02 — Ghi notification nguyên tử và phát socket sau commit

- **Phụ thuộc:** BE-06-01, BE-04-05.
- **Thực hiện:** Trong command workflow, ghi task/event/notification trong transaction. Dùng outbox hoặc cơ chế post-commit có khả năng lấy lại khi phát socket lỗi; xác định idempotency key cho notification theo event + recipient. Socket.IO xác thực phiên khi handshake và kiểm tra lại quyền room `user_{id}`/`task_{id}`; room chat triển khai P1.
- **Đầu ra:** Publisher/retry và event payload versioned.
- **Hoàn thành khi:** Rollback không phát socket; socket lỗi không làm mất notification; không thể join room của user/task khác.

### BE-06-03 — Scheduler nhắc hạn có chống trùng

- **Phụ thuộc:** BE-06-01, BE-01-03.
- **Thực hiện:** Job `@nestjs/schedule` mặc định 15 phút, một instance ở V1; tính mốc sắp hạn 24h, đến hạn, quá hạn ngày đầu/tối đa 1 lần mỗi ngày, tổng hợp quá hạn cho lãnh đạo. Dùng `reminder_events` unique `(taskId, recipientId, reminderType, milestoneKey)` và transaction; xét `dueAt` UTC, ngày/giờ làm việc Việt Nam cho nhắc theo ngày. Khi DONE/CANCELLED ngừng nhắc, khi đổi hạn không dùng mốc cũ chưa phát. Job catch-up sau restart nhưng không spam.
- **Đầu ra:** Scheduler, bảng chống trùng và cấu hình reminder.
- **Hoàn thành khi:** Chạy job hai lần hoặc đồng thời chỉ một notification/mốc; `IN_REVIEW` vẫn có thể quá hạn; `DONE/CANCELLED/DRAFT` không bị nhắc.

### BE-06-04 — Đồng bộ sau mất kết nối và trạng thái đọc

- **Phụ thuộc:** BE-06-02.
- **Thực hiện:** Định nghĩa cursor hoặc `createdAt/id` để client lấy notification bỏ lỡ sau reconnect; socket chỉ là tín hiệu cập nhật, REST là nguồn dữ liệu chuẩn. Xử lý quyền thay đổi trong lúc online, logout, khóa tài khoản và token hết hạn.
- **Đầu ra:** Reconnect contract và ví dụ FE.
- **Hoàn thành khi:** Sau mất mạng, FE tải đủ mục mới/chưa đọc, không nhảy số do event socket lặp.

### BE-06-05 — Nghiệm thu các mốc thông báo

- **Phụ thuộc:** BE-06-01 đến BE-06-04.
- **Thực hiện:** Đi các luồng publish, comment, submit, withdraw, approve, return, đổi hạn/chủ trì và overdue; kiểm tra người nhận, dedupe, thứ tự commit, giờ Việt Nam, server restart, socket reconnect và user bị khóa.
- **Đầu ra:** Bảng `event → recipient → notification → socket → REST` cùng kết quả kiểm tra.
- **Hoàn thành khi:** Mỗi event có đúng recipient; một mốc cron không tạo bản ghi trùng trong các tình huống đã liệt kê.

## Kết quả triển khai — 2026-10-28

BE-06-01 đến BE-06-05 đã hoàn thành. Runtime acceptance trên database scratch xác nhận recipient ACL, API đọc và cursor reconnect, outbox/socket/room, session bị khóa, dedupe reminder theo giờ Việt Nam, loại trừ trạng thái không hoạt động và dữ liệu pending qua server restart. `workflow:check`, lint, typecheck, format check và build đều PASS; xem [bảng kết quả chi tiết](./phase-06/ACCEPTANCE.md).
