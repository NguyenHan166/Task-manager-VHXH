# Phase 09 — Biên bản triển khai và nghiệm thu local (đang tiến hành)

**Ngày chạy:** 29/10/2026 (Asia/Ho_Chi_Minh)  
**Môi trường:** Windows local; PostgreSQL 16 trong Docker, database `office_workspace`, API `127.0.0.1:3011`, FE `127.0.0.1:5174`. Database local đã có dữ liệu trước đó; đã lưu dump trước migration. Không thao tác staging/production.

## Kết quả hiện có

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Migration và seed P1 | PASS | `npm run db:migrate` áp dụng migrations còn thiếu; `npm run db:seed` tạo/cập nhật fixture P1. |
| Fixture/KPI | PASS | `npm run db:check`: 6 users, 2 projects, 17 tasks, 5 submissions; 2 recurrence rules, 1 instance, 4 task links; 2 chat rooms, 7 memberships, 4 messages. KPI OFFICIAL nền: 9 tổng/7 active; KPI mở rộng: 13 tổng/11 active. |
| Server typecheck | PASS | `Server: npm run typecheck`. |
| Frontend build | PASS | `Frontend: npm run build`. |
| Local runtime | PASS | FE trả HTTP 200; `/api/health/ready` báo `status=ok`, `database=ok`; CORS cho `http://127.0.0.1:5174` đúng origin. |
| API smoke/ACL | PASS một phần | Login các vai trò, đọc projects/calendar/recurrence/chat và task theo ACL; nhân viên không được đọc task riêng tư của người khác (404); người ngoài phòng chat không được đọc lịch sử (404). |
| Màn P1 sau khi nối API | Đã khôi phục | Route và thanh điều hướng cho Nhiệm vụ định kỳ, Lịch của tôi, Dự án, Chat và Việc cá nhân được mở trong API mode; các trang tải từ API. Trước thay đổi, route dùng `MockOnlyRoute` và thanh điều hướng lọc toàn bộ mục P1 khi chuyển sang API mode, nên các màn hình thực sự bị ẩn/chặn. |

## Còn chờ trong nghiệm thu

- Chạy trọn journey `t10`–`t17`, kiểm tra số liệu dự án/lịch theo từng role và bảo vệ KPI P0 theo đầy đủ tiêu chí BE-09-01 đến BE-09-03.
- Chạy đồng thời hai quyết định request và hai lần sinh cùng kỳ để chứng minh chỉ có một kết quả; fixture `ri01` hiện tạo đúng bốn nhiệm vụ `t14`–`t17`, seed chạy lại không nhân đôi dữ liệu.
- Kiểm tra file chat qua signed URL, gửi/đọc sau reconnect và unread count trên socket thật.
- Chạy regression đầy đủ Phase 08/09 và benchmark scheduler/socket trên Railway theo BE-09-06. Phép đo Railway và thao tác staging/production BE-08-04 được để sau.

## Khởi động lại local

Từ `Server/`, chạy `npm run db:up`, `npm run dev`; từ `Frontend/`, chạy `npm run dev -- --host 127.0.0.1 --port 5174`. Giữ `.env` local và database volume hiện tại để bảo toàn dữ liệu; `.env` không được commit.

**Trạng thái:** phần triển khai và local runtime đã sẵn sàng để xem/chỉnh giao diện; chưa đánh dấu BE-09-01–BE-09-06 hoàn tất cho tới khi còn lại các tiêu chí nghiệm thu phía trên được chứng minh.
