# Prompt 03 — Dashboard theo vai trò

Tiếp tục trên dự án hiện tại. Tạo hai Dashboard thật sự đọc từ `MockRepository` và selectors dùng chung; không hardcode giá trị trên card hoặc biểu đồ.

## Dashboard Trưởng phòng

- Hàng KPI: tổng nhiệm vụ chính thức hợp lệ, chưa làm, đang làm, chờ duyệt, đã hoàn thành, quá hạn. Mỗi card mở danh sách với bộ lọc tương ứng.
- Biểu đồ donut phân bố trạng thái của `OFFICIAL` đã phát hành, bỏ `DRAFT` và `CANCELLED`; biểu đồ ưu tiên theo số task, không theo số người tham gia.
- Danh sách “Cần xử lý ngay”: quá hạn, chờ duyệt lâu, ưu tiên khẩn; thể hiện hạn, chủ trì, tiến độ, trạng thái.
- Danh sách “Chờ duyệt” có nút mở hồ sơ; thông báo yêu cầu gia hạn đang chờ quyết định.
- Thống kê theo chủ trì, tách rõ số việc phối hợp. Hiển thị tỷ lệ hoàn thành đúng hạn với mẫu số rõ ràng (`DONE` có thời điểm hoàn thành).
- Bộ lọc thời gian/người/dự án/ưu tiên phải tác động lên các chỉ số liên quan đồng bộ. Chỉ số vượt ngoài bộ lọc phải ghi rõ phạm vi riêng nếu thật sự cần.

## Dashboard Chuyên viên

- Card việc tôi chủ trì, phối hợp, sắp đến hạn, quá hạn, chờ duyệt; tách việc cá nhân trong khu vực riêng.
- Danh sách việc cần làm sắp xếp ưu tiên khẩn/quá hạn/gần hạn; mỗi item mở chi tiết.
- Lịch tuần thu nhỏ lấy từ `dueAt`; việc `TEAM` chỉ hiện nếu đã tham gia, `PERSONAL` chỉ hiện với chủ sở hữu.
- Lời chào dùng tên phiên hiện tại, không dùng một tên cố định.

## Công thức và trạng thái

- Dùng `isTaskOverdue` trong hợp đồng dữ liệu. `DONE`/`CANCELLED` không quá hạn hiện tại. Việc `IN_REVIEW` quá hạn vẫn được đánh dấu quá hạn cho đến khi duyệt.
- Trong seed mặc định, tổng Manager phải là 7, trạng thái lần lượt 2/2/1/2 và 1 quá hạn. Nếu số khác, sửa selector/filter thay vì thay số hiển thị.
- Có skeleton, empty state khi bộ lọc không có kết quả, tooltip giải thích KPI. Biểu đồ có nhãn và danh sách thay thế dễ đọc trên mobile.

Kết thúc bằng bảng ngắn liệt kê từng KPI, công thức selector và nơi người dùng bấm để xem chi tiết.
