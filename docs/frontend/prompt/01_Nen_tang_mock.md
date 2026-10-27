# Prompt 01 — Khởi tạo nền tảng và kho mock

Hãy thực hiện Prompt 00 trong dự án hiện tại. Sao chép chính xác hai tệp đính kèm thành `src/shared/data-contract.ts` và `src/mocks/mock-seed.ts` (chỉ sửa import path). Dựng ứng dụng React + TypeScript + Vite với Tailwind CSS, shadcn/ui, React Router và một thư viện icon nhất quán.

## Việc cần làm

1. Tạo các lớp `shared`, `mocks`, `features`, `components`, `app`. Component chỉ gọi hook/service, không truy cập trực tiếp `localStorage` hay sửa mảng seed.
2. Tạo `MockRepository` với các hàm bất đồng bộ cho users, tasks, participants, comments, submissions, approvals, deadline requests, events, notifications, projects, chat, files và settings. Mọi hàm dùng cùng một `MockDb` trong bộ nhớ, lưu snapshot vào `localStorage` sau thay đổi. Có `schemaVersion`, xử lý dữ liệu cũ/hỏng bằng cách reset an toàn.
3. Tạo `SessionProvider` cho đăng nhập demo và đổi nhanh giữa cả 6 tài khoản seed `u01`–`u06` (Trưởng phòng `u01`, Phó phòng `u06`, và Chuyên viên `u02`–`u05`). Đây là demo role switch rõ ràng trên giao diện kèm bảng preview ma trận phân quyền 3 vai trò. Session được giữ sau reload; không tạo mật khẩu giả hoặc tuyên bố đây là xác thực an toàn.
4. Tạo lớp `TaskService`/hooks dùng lại hàm quyền `canSeeTask`, lọc theo `TaskQuery`, sắp xếp và phân trang. Chỉ Lãnh đạo phòng (Manager và Deputy Manager) được tạo và giao `OFFICIAL`; Staff chỉ tạo `TEAM`/`PERSONAL`. Chặn hành động trái quyền ở service mock bằng `AppError`, đồng thời ẩn/vô hiệu hóa hành động ở UI về sau.
5. Tạo selector dùng chung: `getVisibleTasks`, `isTaskOverdue`, `getManagerDashboardStats`, `getStaffDashboardStats`, `getUnreadCount`, `getTaskTimeline`. KPI Lãnh đạo (Manager/Deputy) mặc định chỉ lấy `OFFICIAL` đã phát hành, bỏ `DRAFT`/`CANCELLED`; người phối hợp không nhân đôi số nhiệm vụ.
6. Tạo clock helper dùng ISO UTC và hiển thị `Asia/Ho_Chi_Minh`; định dạng thời gian nhất quán. Seed phải được tạo **một lần** khi chưa có snapshot. Khi reset, tạo seed mới theo thời điểm hiện tại.
7. Thêm trạng thái loading, error và mock delay ngắn 150–350ms. Cho phép bật chế độ lỗi mô phỏng trong menu phát triển để kiểm tra UX, mặc định tắt.

## Điều kiện hoàn thành

- App chạy và hiển thị một trang tạm có tên workspace, phiên demo, số task đọc từ repository và nút reset seed.
- Sau reload, một thay đổi mock vẫn còn; reset phục hồi đúng dữ liệu mẫu.
- Với seed ban đầu, Manager có 7 `OFFICIAL` đã phát hành và còn hiệu lực trong báo cáo mặc định: 2 `TODO`, 2 `IN_PROGRESS`, 1 `IN_REVIEW`, 2 `DONE`; có 1 quá hạn hiện tại. Không đưa `TEAM`/`PERSONAL` vào các số này.
- Không xuất hiện mảng task/user thứ hai trong component hoặc số KPI hardcode.
