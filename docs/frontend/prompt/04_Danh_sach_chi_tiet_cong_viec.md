# Prompt 04 — Danh sách, Kanban và chi tiết công việc

Tiếp tục sửa dự án hiện tại. Xây màn hình “Tất cả công việc” cho Manager, “Công việc của tôi” cho Staff và trang chi tiết `/tasks/:id`, cùng dùng `TaskService` từ Prompt 01.

## Danh sách

- Chuyển List/Kanban; bộ lọc loại việc, trạng thái, ưu tiên, chủ trì, dự án, khoảng hạn, quá hạn; tìm theo mã/tiêu đề; sắp xếp và phân trang. Bộ lọc giữ trong URL query để reload/chia sẻ được.
- Bảng hiện mã, tên, loại, chủ trì, người phối hợp, hạn, ưu tiên, tiến độ, trạng thái. Hạn quá và gần hạn dễ nhận biết bằng chữ + màu/icon.
- Kanban theo `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`; `DRAFT` và `CANCELLED` nằm trong bộ lọc riêng. Kéo thả nếu làm được mà vẫn kiểm tra quyền và transition; nếu không, dùng menu chuyển trạng thái hợp lệ, không tạo thao tác giả.
- Staff không có tùy chọn “Toàn phòng”; Manager không thấy việc `PERSONAL` của Staff. Task nhóm chưa chấp nhận lời mời không vào danh sách công việc đang làm của người được mời.

## Chi tiết

- Header gồm mã, tên, loại, status, priority, nút hành động hợp lệ theo vai trò/trạng thái.
- Khu thông tin: nội dung, đầu ra yêu cầu, chủ trì/phối hợp/theo dõi, hạn, dự án, tiến độ, cờ vướng mắc.
- Các tab/khu: Hoạt động (events), Bình luận, Kết quả nộp và quyết định duyệt, Tệp đính kèm. Hiển thị mọi lần nộp và lần trả lại, không chỉ kết quả mới nhất.
- Bình luận đọc/ghi qua repository. Sau khi gửi, danh sách và thời gian cập nhật đổi ngay; người liên quan nhận notification mock theo quy tắc.
- Nếu không có quyền xem task, hiển thị 403; task không tồn tại hiển thị 404. Khi loading hoặc lỗi có UI phù hợp.

Kết thúc bằng đường dẫn thủ công để kiểm tra `t01`, `t02`, `t04`, `t05`, `t10`, `t12` dưới các tài khoản demo, kèm lý do từng tài khoản xem được hoặc không.
