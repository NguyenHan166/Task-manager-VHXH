# Phase 07 — Dashboard, báo cáo và vận hành P0

**Phụ thuộc:** Task/workflow Phase 03–04; notifications Phase 06 cho số chưa đọc; quyết định backup D-08.  
**Mục tiêu:** Số liệu server-side chính xác, chức năng quản trị đủ vận hành và dữ liệu có thể khôi phục.  
**Cổng qua phase:** KPI khớp fixture; export theo đúng phạm vi; settings/audit/backup chỉ Manager; một bản khôi phục thử nghiệm được kiểm chứng.

## Task

### BE-07-01 — Dashboard theo vai trò

- **Phụ thuộc:** BE-03-03, BE-04-03, BE-00-04.
- **Thực hiện:** `GET /api/dashboard/stats` trả `ManagerDashboardStats` khi scope toàn phòng và `StaffDashboardStats` theo chính user. Query tổng hợp ở DB, không tải mọi task về app. KPI toàn phòng mặc định chỉ `OFFICIAL` đã phát hành, loại DRAFT/CANCELLED; overdue khi `dueAt < now` và chưa DONE/CANCELLED/DRAFT; đúng hạn khi `completedAt <= dueAt` theo chính sách snapshot hạn. Đếm task theo chủ trì một lần, phối hợp tách riêng. Bộ lọc ngày/người/project/priority/status áp dụng nhất quán và có timezone rõ.
- **Đầu ra:** DTO stats, truy vấn aggregate và chú thích công thức.
- **Hoàn thành khi:** Fixture P0 trả 7 task hợp lệ, 1 quá hạn, 1/2 DONE đúng hạn; Manager không thấy PERSONAL người khác. Mốc fixture đủ 17 task trả 11 hợp lệ được kiểm lại ở Phase 09 sau migration recurrence.

### BE-07-02 — Báo cáo và xuất CSV/XLSX

- **Phụ thuộc:** BE-07-01.
- **Thực hiện:** `GET /api/reports/kpi`, `GET /api/reports/tasks` và `/export` với cùng filter/scope/định nghĩa KPI. Chỉ lãnh đạo xuất toàn phòng; STAFF chỉ xem phần của mình nếu contract cho phép. File xuất có tiêu đề cột tiếng Việt, người xuất, mốc thời gian UTC/hiển thị Việt Nam, bộ lọc, số liệu rõ mẫu số. Stream/giới hạn quy mô và an toàn CSV formula injection; không đưa PERSONAL vào báo cáo toàn phòng.
- **Đầu ra:** API report + CSV/XLSX, ví dụ đối chiếu với màn Reports.
- **Hoàn thành khi:** Danh sách sau filter và file xuất cùng số dòng/số liệu; DEPUTY/STAFF nhận quyền đúng D-01; dữ liệu riêng tư không lộ trong file.

### BE-07-03 — Settings và audit quản trị

- **Phụ thuộc:** BE-02-04, BE-04-05.
- **Thực hiện:** `GET/PATCH /api/settings` với `workspaceName`, `defaultDueHour`, `reminderBeforeHours`, `maxFileSizeMb`, timezone cố định hoặc chính sách đã chốt. Chỉ MANAGER sửa; thay đổi ảnh hưởng scheduler/file có hiệu lực và được audit. Tách `task_events` cho lịch sử task với `audit_logs` cho đăng nhập, quản trị user, settings, backup; audit append-only, API lọc/phân trang chỉ MANAGER.
- **Đầu ra:** Settings/audit endpoints và bảng loại sự kiện.
- **Hoàn thành khi:** Deputy/Staff bị `403` với PATCH/settings audit; nhật ký có actor, thời gian, đối tượng, before/after đã lọc dữ liệu nhạy cảm.

### BE-07-04 — Backup, restore và retention

- **Phụ thuộc:** BE-01-03, D-08.
- **Thực hiện:** Áp dụng D-08: backup PostgreSQL hằng ngày, mã hóa và lưu trong private bucket riêng với DB chính, giữ 30 ngày; thử khôi phục mỗi tháng trong môi trường cô lập. Thiết kế quyền tải backup Manager-only nếu API `/api/backup` được giữ; không để JSON dump chứa hash/secret lộ qua client ngoài chính sách. Runbook phải xử lý backup metadata R2 và khả năng file object cần khôi phục riêng. Giới hạn tài nguyên để phù hợp Railway nhỏ.
- **Đầu ra:** Job/config, runbook và báo cáo restore thử.
- **Hoàn thành khi:** Có thể khôi phục bản DB đã biết, kiểm tra số user/task/file metadata; backup lỗi có cảnh báo; retention/xóa bản cũ được ghi rõ.

### BE-07-05 — Observability và ràng buộc tài nguyên

- **Phụ thuộc:** BE-07-01 đến BE-07-04.
- **Thực hiện:** Metric/log cho request lỗi, login fail, cron chạy/trùng, upload fail, socket disconnect, thời gian truy vấn KPI, backup status. Đặt alert tối thiểu cho health/backup lỗi; kiểm tra index bằng plan truy vấn trên fixture mở rộng. Ghi RAM/CPU/DB connections thực tế trên staging; ngân sách Railway khoảng 5 USD là mục tiêu, không là bảo đảm.
- **Đầu ra:** Dashboard vận hành tối thiểu, ngưỡng cảnh báo và tài liệu xử lý sự cố.
- **Hoàn thành khi:** Có dấu vết để tìm một request nghiệp vụ từ request ID đến event/notification; không log nội dung nhạy cảm hoặc signed URL.
