# Phase 09 — Cộng tác P1

**Phụ thuộc:** P0 Phase 08 ổn định.  
**Mục tiêu:** Mở các màn cộng tác FE trên dữ liệu thật mà vẫn giữ ACL, lịch sử và công thức KPI của P0.  
**Cổng qua phase:** TEAM/PERSONAL, dự án/lịch, việc con/đề nghị, định kỳ và chat hoạt động qua API thật; không thay đổi ngầm KPI OFFICIAL.

## Task

### BE-09-01 — TEAM, PERSONAL và lời mời

- **Phụ thuộc:** BE-03-01, BE-04-05.
- **Thực hiện:** Mở tạo/sửa/hoàn thành TEAM/PERSONAL theo role. PERSONAL chỉ chủ sở hữu, không có participant hoặc KPI phòng. TEAM có invitation PENDING/ACCEPTED/DECLINED, thông báo mời và projection giới hạn trước ACCEPTED; người bị từ chối không xem task. Chủ nhiệm TEAM xác nhận hoàn tất theo quy tắc đã chốt. Lãnh đạo có command chuyển TEAM → OFFICIAL, cấp mã `CV-...` mới và giữ mã cũ trong event.
- **Đầu ra:** API task type/invitation/convert và policy cập nhật.
- **Hoàn thành khi:** `t10`/`t11` xử lý lời mời đúng, `t12`/`t13` riêng tư, TEAM/PERSONAL không lọt vào KPI OFFICIAL mặc định.

### BE-09-02 — Dự án và lịch

- **Phụ thuộc:** BE-09-01, BE-07-01.
- **Thực hiện:** CRUD project theo quyền, danh sách task thuộc project qua ACL từng task; dashboard dự án tính từ query chuẩn. `GET /api/calendar` cho ngày/tuần/tháng hoặc date range, chỉ task có dueAt và người xem được; convert UTC sang ngày hiển thị Việt Nam ở FE. Không cho project ID là đường lách để xem PERSONAL của người khác.
- **Đầu ra:** Project/calendar APIs và FE route nối thật.
- **Hoàn thành khi:** Số task trong dự án khớp list cùng filter; lịch của STAFF không có task ngoài quyền.

### BE-09-03 — Việc con và yêu cầu gia hạn/đổi chủ trì

- **Phụ thuộc:** BE-04-04, BE-09-01.
- **Thực hiện:** Tạo việc con tối đa 2 cấp, kiểm tra hạn con/cha và không tự DONE cha. Xây `TaskDeadlineRequest` và `TaskAssigneeRequest` append-only: chỉ chủ trì tạo, một yêu cầu PENDING mỗi loại/task, lãnh đạo quyết định trong transaction; chỉ khi APPROVED mới đổi task. Lưu before/after event, thông báo và tính lại ACL/reminder. Hoàn thiện view chờ duyệt gồm submission và request.
- **Đầu ra:** Endpoints request/decision/subtask; lịch sử đầy đủ.
- **Hoàn thành khi:** Yêu cầu PENDING không đổi hạn/người; hai quyết định đồng thời chỉ một thành công; task cha không tự hoàn thành.

### BE-09-04 — Nhiệm vụ định kỳ

- **Phụ thuộc:** BE-09-03, BE-06-03.
- **Thực hiện:** Migration `recurrence_rules`, `recurrence_rule_assignees`, `recurrence_instances`, bảng nối task. Lãnh đạo CRUD/toggle/generate; STAFF chỉ xem kỳ được giao và nộp qua submission chuẩn. `ALL` sinh task riêng cho mỗi STAFF ACTIVE; `CUSTOM` theo danh sách; khóa unique `(ruleId, periodKey)` và transaction chống sinh trùng, kể cả manual trigger/cron cùng lúc. Tính `nextRunAt` theo timezone và chu kỳ được chốt.
- **Đầu ra:** API/scheduler định kỳ và dữ liệu `rr01`, `rr02`, `ri01`.
- **Hoàn thành khi:** `ri01` sinh đúng `t14`–`t17`; chạy lại không sinh thêm; kỳ cũ vẫn tồn tại khi xóa/tắt rule.

### BE-09-05 — Chat 1–1/nhóm và file chat

- **Phụ thuộc:** BE-06-02, BE-05-04, BE-09-01.
- **Thực hiện:** Migration room/member/message; REST danh sách phòng, lịch sử phân trang, gửi, đánh dấu đọc, tạo phòng. Chỉ member xem/gửi hoặc cấp signed URL file chat; kiểm tra member khi join Socket.IO room. Lưu message vào DB trước khi phát socket, dùng ID/cursor để lấy message bỏ lỡ sau reconnect. Tìm kiếm trong phạm vi phòng được tham gia.
- **Đầu ra:** Chat REST/socket/file link và FE route nối thật.
- **Hoàn thành khi:** User ngoài phòng không đọc/gửi/tải file; reload/reconnect không mất hoặc nhân đôi tin; unread count khớp lịch sử DB.

### BE-09-06 — Nghiệm thu P1 và bảo vệ P0

- **Phụ thuộc:** BE-09-01 đến BE-09-05.
- **Thực hiện:** Chạy lại journey P0 và benchmark KPI, sau đó kiểm tra `t10`–`t17`, project/calendar, recurrence chống trùng, request concurrent, chat reconnect và ACL file. Đo tài nguyên scheduler/socket trên một instance Railway; chỉ đề xuất queue/Redis khi có số liệu cần thiết.
- **Đầu ra:** Biên bản nghiệm thu P1 và ghi nhận thay đổi dữ liệu/API.
- **Hoàn thành khi:** Chức năng P1 dùng được mà số KPI OFFICIAL của P0 không đổi sai vì TEAM/PERSONAL hoặc participant bị tính trùng.
