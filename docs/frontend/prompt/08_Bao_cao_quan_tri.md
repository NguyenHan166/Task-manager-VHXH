# Prompt 08 — Báo cáo, thành viên, cài đặt và nhật ký

Tiếp tục trên dự án hiện tại. Dựng các màn hình quản lý và báo cáo phục vụ việc kiểm tra UI/UX, cùng lấy dữ liệu từ mock repository.

## Báo cáo

- Trang báo cáo toàn phòng cho Manager với bộ lọc thời gian, chủ trì, project, priority, status. Có KPI tổng, đúng hạn/trễ hạn, danh sách quá hạn và chờ duyệt, bảng theo từng người **chủ trì**. Người phối hợp thể hiện ở cột riêng, không cộng trùng một task.
- Báo cáo chính thức mặc định chỉ dùng `OFFICIAL` đã phát hành và không hủy. Cho bật tùy chọn xem thêm `TEAM`, hiển thị rõ rằng số đó nằm ngoài KPI chính thức. Không đưa `PERSONAL` vào báo cáo toàn phòng.
- Xuất CSV từ dữ liệu đã lọc; file có tiêu đề cột tiếng Việt và metadata ngày xuất/người xuất/bộ lọc. Nếu thêm XLSX thì dùng cùng selector, không một công thức riêng. Staff chỉ xem thống kê cá nhân và không xuất dữ liệu toàn phòng.
- Tooltip giải thích định nghĩa: `isTaskOverdue`, hoàn thành đúng hạn (`completedAt <= dueAt`), tỷ lệ hoàn thành, khoảng thời gian lọc.

## Thành viên (Manager)

- Danh sách tài khoản, lọc trạng thái/vai trò, tạo Staff mock, sửa hồ sơ cơ bản, khóa/mở tài khoản. Không cho khóa Manager hoạt động cuối cùng. Không cho Staff tự sửa role.
- Tài khoản bị khóa không chọn được làm phiên demo, nhưng dữ liệu lịch sử vẫn hiển thị tên người đó trong task/chat/audit.

## Cài đặt và nhật ký

- Settings có tên phòng, `defaultDueHour`, `reminderBeforeHours`, `maxFileSizeMb`, timezone hiển thị. Đổi settings cập nhật UX liên quan, có validation.
- Trang nhật ký hiển thị `TaskEvent` theo thời gian, người thao tác, loại hành động, đối tượng và chi tiết trước/sau. Giao diện không có nút sửa/xóa audit.
- Profile của tài khoản đang dùng: tên, chức danh, avatar chữ cái, trạng thái; sửa các trường được phép trong mock.
- Nút reset dữ liệu demo đặt trong menu cài đặt với xác nhận rõ rằng thay đổi local sẽ mất.

Kết thúc bằng ví dụ đối chiếu: báo cáo phải có cùng 7 việc chính thức hợp lệ như Dashboard Manager ở seed mặc định; `t05` đúng hạn, `t06` trễ hạn; `t04` quá hạn hiện tại.
