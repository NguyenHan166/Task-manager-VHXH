# Phase 08 — Kết nối Frontend và phát hành P0

**Phụ thuộc:** Phase 02–07 hoàn thành cổng nghiệm thu.  
**Mục tiêu:** FE dùng API thật cho toàn bộ phạm vi P0; phát hành trên staging rồi production theo quy trình dữ liệu được chấp thuận.  
**Cổng qua phase:** Một hành trình người dùng P0 chạy trên môi trường triển khai với auth, task, file, notification, KPI và quản trị; backup/restore và quyền đã được kiểm chứng.

## Task

### BE-08-01 — Tạo adapter HTTP và chuyển nguồn dữ liệu FE

- **Phụ thuộc:** BE-00-03, BE-02-01, BE-03-03.
- **Thực hiện:** Tạo interface repository đúng API cần dùng, `HttpRepository` và cấu hình chọn adapter; chuyển các trang đang import `mockRepository` trực tiếp sang interface/hook/service theo từng vertical slice. Thay `SessionContext` demo bằng phiên thật và `GET /auth/me`; giữ mock chỉ cho môi trường demo rõ ràng. Xử lý refresh, logout, `401`, loading/error và thay đổi role mà không tin localStorage `userId`.
- **Đầu ra:** FE build có chế độ API thật và đường chọn môi trường rõ.
- **Hoàn thành khi:** Các route P0 không còn phụ thuộc `mock-seed.ts`/localStorage cho dữ liệu nghiệp vụ; đóng tab/mở lại vẫn có phiên hợp lệ theo chính sách.

### BE-08-02 — Nối từng màn P0 và trạng thái lỗi

- **Phụ thuộc:** BE-08-01 và endpoint tương ứng.
- **Thực hiện:** Nối `/dashboard`, `/tasks`, `/tasks/:id`, phần duyệt submission của `/approvals`, `/notifications`, `/files`, `/reports`, `/members`, `/settings`, `/profile`. Dùng phân trang/sort/filter server-side; cập nhật sau mutation bằng refetch hoặc cache invalidation; upload thật qua signed PUT và complete; nghe socket rồi đồng bộ qua REST. Hiển thị 401/403/404/409/validation, không báo thành công khi transaction chưa commit. Theo D-11, phần yêu cầu gia hạn/đổi chủ trì trong `/approvals` chỉ bật với API thật ở Phase 09.
- **Đầu ra:** Bảng route → API → UI state → quyền.
- **Hoàn thành khi:** Từ một thay đổi task, dashboard/list/detail/notification/report hiển thị cùng trạng thái; URL trực tiếp sai quyền hiện 403 và không render dữ liệu.

### BE-08-03 — Contract và journey nghiệm thu P0

- **Phụ thuộc:** BE-08-02.
- **Thực hiện:** Đối chiếu OpenAPI với request FE thật, DTO, timezone, mã lỗi và seed. Đi journey Manager/Deputy giao việc → Staff làm/nộp/file → Deputy/Manager trả lại hoặc duyệt → KPI/notification/audit cập nhật. Kiểm tra staff A/B, PERSONAL nếu có fixture, last Manager, upload R2, cron lặp, backup restore. Kiểm tra 11–20 người đồng thời theo kịch bản dùng thật đã chọn.
- **Đầu ra:** Bảng nghiệm thu có pass/fail và vấn đề cần sửa.
- **Hoàn thành khi:** Không còn lỗi P0 làm sai quyền, mất dữ liệu, sai KPI hoặc không khôi phục được.

### BE-08-04 — Staging, triển khai và tài liệu vận hành

- **Phụ thuộc:** BE-08-03, D-08.
- **Thực hiện:** Railway service NestJS + PostgreSQL private networking, biến môi trường qua secret store, migration trong release, FE static hosting, domain HTTPS/WSS, CORS, R2 bucket private. Xác nhận chính sách đơn vị trước khi dùng dữ liệu nghiệp vụ thật trên cloud; staging dùng dữ liệu giả lập. Chuẩn bị rollback ứng dụng/migration tương thích, health check, log/metric, backup và người vận hành. Ghi chi phí thực tế theo tuần đầu.
- **Đầu ra:** Runbook deploy/rollback, cấu hình staging/production và biên bản nghiệm thu P0.
- **Hoàn thành khi:** Triển khai lại từ commit được; migration không cần thao tác thủ công mơ hồ; có kế hoạch khôi phục khi release lỗi.
