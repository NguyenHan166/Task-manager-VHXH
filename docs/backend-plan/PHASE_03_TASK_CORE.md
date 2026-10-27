# Phase 03 — Nhiệm vụ lõi, truy vấn và quyền bản ghi

**Phụ thuộc:** Phase 02 và migration lõi Phase 01.  
**Mục tiêu:** Tạo/đọc/chỉnh sửa nhiệm vụ theo quyền, không lộ task qua list, search, detail hoặc quan hệ phụ.  
**Cổng qua phase:** Một MANAGER tạo được bản nháp OFFICIAL, chỉ người tạo thấy nháp; khi có task đã phát hành từ fixture, đúng người thấy list/detail/comment theo ACL. Luồng phát hành và duyệt thuộc Phase 04.

## Task

### BE-03-01 — Task policy và truy vấn scoped

- **Phụ thuộc:** BE-02-02, BE-00-02.
- **Thực hiện:** Mã hóa `canSeeTask` ở BE: DRAFT chỉ người tạo; OFFICIAL đã phát hành cho lãnh đạo và thành viên liên quan; PERSONAL chỉ chủ sở hữu; TEAM chỉ người tạo, chủ trì và lời mời đã ACCEPTED. Lời mời PENDING chỉ có projection giới hạn. Tạo query scope ở tầng DB; tất cả truy vấn liên quan project, calendar, file, search, report dùng cùng policy. Quyền của người chủ trì cũ sau chuyển giao được tính lại theo participant hiện tại.
- **Đầu ra:** Policy service + query predicates tái sử dụng.
- **Hoàn thành khi:** Không thể lách ACL qua ID trực tiếp, tổng số trang, filter, search, file link hoặc event; manager không thấy PERSONAL của nhân viên.

### BE-03-02 — Tạo task, người tham gia và mã nghiệp vụ

- **Phụ thuộc:** BE-03-01, BE-01-03.
- **Thực hiện:** `POST /api/tasks` cho phạm vi P0 `OFFICIAL` (TEAM/PERSONAL mở tại Phase 09 theo scope Phase 00). Cho lưu DRAFT thiếu trường được phép; khi tạo task đã phát hành qua phương án được chốt thì áp dụng validation publish ở Phase 04. Sinh ID/mã `CV-YYYY-...` nguyên tử, không tin mã/creator/status/assignedAt từ client. Kiểm tra chủ trì ACTIVE, collaborator/watcher không trùng, không tự tạo participant vô nghĩa, project/parent hợp lệ nếu có. Tạo `TaskEvent.CREATED` trong cùng transaction.
- **Đầu ra:** Create DTO, command service, event và migration sequence/counter nếu cần.
- **Hoàn thành khi:** Hai request đồng thời không tạo cùng mã; STAFF không tạo OFFICIAL; bản nháp không bị người được gán xem trước phát hành.

### BE-03-03 — Danh sách, tìm kiếm, sắp xếp, phân trang và detail

- **Phụ thuộc:** BE-03-01.
- **Thực hiện:** `GET /api/tasks` nhận `TaskQuery` đã chốt, áp dụng filter ACL **trước** đếm `total`. Hỗ trợ type/status/priority/scope/assignee/project/search/due range/isOverdue, sort server-side có tie-breaker ổn định và `NULLS LAST` cho hạn rỗng. Giới hạn `pageSize`, validate ngày giờ, trả `Page<Task>`. `GET /api/tasks/:id` trả dữ liệu liên quan theo `TaskDetailResponse` đã chốt, phân trang riêng các danh sách dài.
- **Đầu ra:** Query API và ví dụ URL FE dùng cho List/Kanban.
- **Hoàn thành khi:** Cùng query cho kết quả ổn định qua nhiều trang; `total` không tiết lộ task không có quyền; không tải toàn bộ tasks vào RAM để lọc.

### BE-03-04 — Sửa metadata được phép và bình luận

- **Phụ thuộc:** BE-03-01, BE-03-02.
- **Thực hiện:** `PATCH /api/tasks/:id` chỉ nhận trường mô tả/đầu ra/priority/project theo policy và trạng thái; `status`, `dueAt`, `primaryAssigneeId` phải đi qua command chuyên biệt nếu đã giao. `POST/GET /api/tasks/:id/comments` kiểm tra quyền đọc/ghi và lưu author từ phiên. Chặn bình luận rỗng, hạn chế kích thước, tạo event/notification theo quy tắc Phase 06.
- **Đầu ra:** Endpoint sửa task và comment, audit event tương ứng.
- **Hoàn thành khi:** Client không đổi status/owner/createdBy qua PATCH; người không có quyền không đọc/ghi comment; comment còn sau task đổi trạng thái.

### BE-03-05 — Kiểm tra ma trận đọc/ghi task

- **Phụ thuộc:** BE-03-01 đến BE-03-04.
- **Thực hiện:** Đối chiếu fixture `t01`–`t13` dưới u01/u06/u02–u05; kiểm tra DRAFT, PERSONAL, TEAM PENDING/DECLINED, OFFICIAL, user LOCKED, search, pagination, parent/project. Ghi các tình huống chưa mở P0 thành feature gate rõ ràng.
- **Đầu ra:** Bảng kết quả quyền và truy vấn đối chiếu.
- **Hoàn thành khi:** Không có endpoint P0 trả dữ liệu trái policy; P1 chưa triển khai không tạo response thành công giả.
