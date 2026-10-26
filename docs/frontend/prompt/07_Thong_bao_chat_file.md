# Prompt 07 — Thông báo, chat và file mock

Tiếp tục trên dự án hiện tại. Hoàn thiện các luồng thông tin liên quan đến task. Dùng các entity chuẩn trong `data-contract.ts`, đọc/ghi chung `MockDb`.

## Thông báo

- Chuông topbar hiển thị số chưa đọc thật từ `notifications` của tài khoản hiện tại; dropdown 5 mục gần nhất, trang đầy đủ có lọc “Tất cả/Chưa đọc”.
- Click thông báo đánh dấu đã đọc rồi mở đúng task hoặc phòng chat. Riêng thông báo `TEAM_INVITED` mở **thẻ lời mời giới hạn thông tin** để chấp nhận/từ chối; chưa chấp nhận thì không mở toàn bộ chi tiết task. Nếu entity không còn quyền truy cập, hiển thị thông báo phù hợp.
- Giao việc, nộp duyệt, trả lại, duyệt, bình luận, đổi hạn/người và mời việc nhóm phải tạo notification đúng người. Không thông báo cho người không liên quan hoặc tạo trùng khi render lại.
- Màn demo nhắc hạn có thể có nút “Chạy nhắc hạn mẫu” trong phần cài đặt demo: tạo mốc 24 giờ/quá hạn theo `dueAt`, không gửi lặp cùng người + task + mốc. Chú thích đây là mô phỏng scheduler, không chạy cron thật trong trình duyệt.

## Chat (bản xem trước P1)

- Danh sách hội thoại, chat 1–1 và nhóm, unread count, gửi tin nhắn text, hiển thị theo thứ tự thời gian, empty state, tìm trong tin nhắn đã tải.
- Chỉ thành viên phòng chat mới xem/gửi được. Gửi tin phải lưu `chatMessages` trước khi cập nhật UI; chuyển tài khoản demo để thấy cùng lịch sử. Không giả lập WebSocket đang hoạt động nếu không có server; hiển thị cập nhật tức thời trong cùng tab và đồng bộ từ `localStorage` khi đổi phiên.
- Bình luận trong task vẫn ở task, không trộn vào chat chung.

## File (bản mô phỏng UI)

- Cho chọn file tại task/submission/chat với giới hạn cấu hình mặc định 20 MB và loại PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, JPG/PNG. Sau chọn, lưu **metadata** vào `FileObject` và `FileLink`, `status: MOCK_LOCAL`, `objectKey: null`.
- Hiển thị tên, loại, dung lượng, người thêm, đối tượng liên kết; có hủy liên kết theo quyền. Sau reload, metadata còn nhưng không hứa có thể tải bytes thật. Nếu muốn xem thử trong phiên hiện tại, dùng Object URL tạm và ghi rõ chỉ hiệu lực trong phiên.
- Không đưa secret R2 vào frontend, không tạo URL upload/download giả. Trên giao diện có nhãn ngắn “Tệp mẫu; chức năng lưu tệp sẽ kết nối R2 ở backend”.

Kết thúc bằng mô tả cách kiểm tra `n01` của Manager, `n03` của Staff, phòng `r01` và file `f02`.
