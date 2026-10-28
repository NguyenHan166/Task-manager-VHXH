# Phase 08 — Biên bản nghiệm thu BE-08-01 đến BE-08-03

**Ngày chạy:** 28/10/2026 (Asia/Ho_Chi_Minh)  
**Môi trường:** local Windows, PostgreSQL disposable trong Docker, fixture giả Phase 00, API và FE build local. Không dùng dữ liệu nghiệp vụ thật hoặc database mặc định cho kịch bản FE/API.

## Kết quả

| Cổng | Kết quả | Bằng chứng |
|---|---|---|
| FE build/typecheck | PASS | `Frontend: pnpm build` (`tsc && vite build`). |
| BE build/typecheck/lint/format | PASS | `Server: npm run build`, `npm run typecheck`, `npm run lint`, `npm run format:check`. |
| Migration/seed/fixture | PASS | DB thử mới; 6 migrations áp dụng; fixture có 6 users, 2 projects, 13 tasks, 6 participants, 4 submissions, 3 approvals, 1 settings row. KPI fixed-clock khớp fixture. |
| OpenAPI/DTO và FE adapter | PASS | `npm run phase08:check`: đối chiếu các method/path P0 và trường DTO; tải `HttpRepository` thật bằng Vite SSR; kiểm tra UTC serialization cho giờ Việt Nam. |
| Quyền và lỗi | PASS | Staff B không đọc được task Staff A (404 và list không chứa task); API trả 409 khi cố hạ quyền Manager ACTIVE cuối cùng; DTO lỗi trả VALIDATION; settings mutation được ghi audit. |
| Journey OFFICIAL | PASS | Deputy tạo và phát hành; Staff A bắt đầu, cập nhật tiến độ, nộp; Deputy trả lại; Staff A nộp vòng hai; Manager duyệt; status, event history, submissions, report/KPI, dashboard và notification khớp. |
| Tệp/comment R2 | PASS | FE adapter upload file COMMENT qua signed URL, truy vấn được liên kết COMMENT và xóa file thử sau kiểm tra. `Server: npm run files:check -- --r2` đạt 80 checks; 6 object kiểm tra được tạo và dọn. |
| Notification/cron | PASS | `Server: npm run notifications:check`: recipient ACL, outbox/socket, reconnect cursor, locked-user handshake, nhắc hạn múi giờ Việt Nam và chạy job lặp không tạo thông báo trùng. |
| Backup/restore | PASS | `backup:run` và `backup:drill -- --confirm` thành công trên cấu hình local cô lập; DB khôi phục khớp `users=18`, `tasks=26`, `fileObjects=0`. Đây là drill local, chưa thay thế kiểm tra backup S3 staging. |
| Tải đồng thời | PASS | 12 phiên STAFF, 36 GET đồng thời (dashboard/task/notification), tất cả thành công và mỗi người chỉ thấy task được giao; client p95 **120 ms** trên DB fixture local. Đây là phép đo local, không phải cam kết staging. |

Kết quả cuối của `npm run phase08:check`: **PASS, 88 assertions; concurrentUsers=12, requests=36, p95=120ms**.

## Vấn đề phát hiện và đã sửa

- FE tạo task không phải nháp chỉ POST DRAFT rồi báo như đã giao. Adapter giờ gọi `publish` trước khi báo hoàn tất; journey kiểm tra task đã ở TODO.
- Nút tạo TEAM/PERSONAL từng mở trong API mode dù đây là P1. Route tạo và các link tương ứng hiện được giới hạn cho leader hoặc mock mode.
- Task detail chưa tải/hiển thị tệp gắn với COMMENT. Bình luận giờ hỗ trợ chọn nhiều tệp, upload qua luồng R2, tải xuống và thông báo riêng nếu bình luận đã gửi nhưng một tệp lỗi. Kịch bản FE/API đã upload và đọc lại liên kết COMMENT thật.
- Hai script dọn file dùng import TS source trong `tsx`, khiến metadata Nest không khởi tạo được `SchedulerRegistry`; chúng chuyển sang module đã build. Chạy file matrix lại đạt 80 checks.

## Giới hạn còn lại

- Fixture không có task PERSONAL; phạm vi TEAM/PERSONAL thuộc Phase 09 nên mục “PERSONAL nếu có fixture” là **N/A** trong nghiệm thu P0.
- Đã đo 12 user đồng thời, trong yêu cầu 11–20. Cần đo lại latency, resource, alert, CORS/domain và backup trên staging tại BE-08-04.
- Backup drill này dùng local-only encrypted backup. Chưa cấu hình/chứng minh bucket backup S3 trên staging, rollback deployment/migration hoặc chính sách dữ liệu thật D-08.

Không còn lỗi P0 đã biết trong phạm vi contract và journey local ở trên. **BE-08-01, BE-08-02, BE-08-03 đạt; BE-08-04 vẫn đang chờ.**

## Chạy UI và kiểm thử local

Backend cần `.env` local đã tạo bằng `npm run db:init`, PostgreSQL cục bộ, migration và seed. Chạy hai terminal:

```powershell
# Terminal 1 — Server/
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev

# Terminal 2 — Frontend/
$env:VITE_DATA_MODE = "api"
$env:VITE_API_BASE_URL = "http://localhost:3010/api" # đổi 3010 theo PORT trong Server/.env
pnpm dev
```

Mở URL Vite hiện trên terminal (mặc định `http://localhost:5173`), đăng nhập bằng một trong các tài khoản `u01`–`u06` và giá trị `DEMO_SEED_PASSWORD` trong `Server/.env`. Bản FE API phải có `VITE_DATA_MODE=api` và `VITE_API_BASE_URL` trỏ đúng đến API local (`PORT` trong ví dụ backend là 3000; cổng môi trường này đang đặt 3010).

Kịch bản chấp nhận tự động `Frontend: npm run phase08:check` từ chối DB không có prefix `office_workspace_phase08_verify`; nạp migration và seed fixture lên DB disposable trước khi chạy. `Server: npm run files:check -- --r2`, `npm run notifications:check` và backup drill có yêu cầu cấu hình R2/local backup tương ứng. Không dùng `db:clean` trên database đang dùng.
