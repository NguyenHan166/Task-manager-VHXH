# Prompt 09 — Rà soát trải nghiệm và tính nhất quán

Tiếp tục trên dự án hiện tại. Rà lại toàn bộ frontend theo góc nhìn người dùng và sửa các điểm chưa hoàn chỉnh. Đây là bước hoàn thiện UI/UX trước khi thiết kế backend.

## Những việc cần rà

1. Đi qua từng route bằng Manager và Staff; sửa link chết, hành động không phản hồi, form lưu xong mà màn khác không đổi, quyền hiển thị sai, số liệu không khớp.
2. Xem ở 1440px, 1024px, 768px và 390px. Tránh bảng bị cắt, drawer/modal tràn màn, tooltip che nội dung, nút hành động quá nhỏ trên mobile.
3. Kiểm tra keyboard: tab order, focus visible, Escape đóng dialog, Enter submit hợp lệ, label/aria cho icon button; biểu đồ có bảng hoặc mô tả chữ tương đương. Trạng thái/ưu tiên phải có nhãn chữ.
4. Tất cả trang có loading, empty, error; lỗi form nằm gần trường. Dữ liệu mock lỗi/hỏng có cách reset. Toast thông báo ngắn, không che mất thông tin quan trọng.
5. Đối chiếu từng trang với **Prompt 01A** và trang `/ui-kit`: đúng token màu, typography, spacing, card, table, dialog, badge. Nội dung tiếng Việt tự nhiên. Biểu đồ và thẻ KPI lấy từ selector; không có “300 công việc” hoặc số mẫu lấy từ ảnh tham chiếu.
6. Kiểm tra tình huống biên: `DRAFT` chỉ người tạo thấy; `DONE`/`CANCELLED` không bị nhắc quá hạn; `IN_REVIEW` vẫn có thể quá hạn; Staff A không xem việc riêng Staff B; Manager không thấy `PERSONAL` của Staff; lời mời `PENDING` không tự biến thành thành viên đã chấp nhận; yêu cầu gia hạn chưa duyệt không đổi hạn.
7. Kiểm tra mọi modal và hành động hủy/duyệt/trả lại có xác nhận, lý do và trạng thái nút trong lúc lưu. Không tạo thông báo hoặc event trùng khi bấm hai lần.

## Kết quả trả về

- Sửa trực tiếp mã, không chỉ liệt kê lỗi.
- Trả một bảng ngắn: màn hình, điều chỉnh đã làm, cách kiểm tra thủ công.
- Liệt kê tối đa 5 điểm còn cần backend thật để hoạt động hoàn chỉnh; phân biệt rõ giới hạn của mock file, xác thực và realtime.
