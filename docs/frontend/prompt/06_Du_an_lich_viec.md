# Prompt 06 — Dự án, lịch, việc nhóm và việc cá nhân

Tiếp tục trên dự án hiện tại. Tạo các màn hình P1 để nhìn được bức tranh sản phẩm đầy đủ, vẫn dùng cùng mock repository. Chú thích “Bản xem trước” cho chức năng chưa định làm trong MVP, nhưng tương tác mock phải nhất quán.

## Dự án và lịch

- Danh sách dự án, trang chi tiết dự án: mô tả, thời gian, trạng thái, task liên quan, thống kê số việc/hoàn thành/quá hạn từ selector. Không tạo một mảng thống kê riêng.
- Manager có thể tạo/sửa dự án mock; Staff chỉ xem dự án có task mình được quyền xem. Trong dự án, từng task vẫn phải qua kiểm tra quyền bản ghi.
- Lịch tháng/tuần/ngày từ `dueAt`; bộ lọc “Của tôi”, “Phối hợp”, “Toàn phòng” (chỉ Manager). Click sự kiện mở chi tiết task. Việc không có `dueAt` không đưa lên lịch.
- Giờ trên lịch theo `Asia/Ho_Chi_Minh`; ngày chỉ có hạn ngày trong form phải quy đổi theo `defaultDueHour` trước khi lưu UTC.

## Việc nhóm `TEAM`

- Staff/Manager tạo việc nhóm và mời thành viên. Lời mời có `PENDING`; người được mời có màn hình chấp nhận/từ chối. Chỉ khi `ACCEPTED` họ mới vào danh sách thành viên xử lý và xem nội dung theo quyền.
- Việc nhóm có một chủ trì và người phối hợp; người tạo xác nhận hoàn tất, không gửi cho Manager duyệt mặc định. Chỉ Manager mới chuyển `TEAM` thành `OFFICIAL`; khi chuyển phải chọn người chủ trì và hạn, ghi lịch sử và thông báo.
- Khi chuyển `TEAM` thành `OFFICIAL`, cấp mã `CV-...` mới; giữ mã `NH-...` cũ trong event để truy vết.
- Có view rõ ràng phân biệt “Việc nhóm” với “Nhiệm vụ chính thức”.

## Việc cá nhân `PERSONAL`

- Tạo, sửa, hoàn thành việc cá nhân từ màn hình riêng. Chủ sở hữu luôn là tài khoản đang dùng, không có người được mời và không tham gia KPI toàn phòng.
- Khi chuyển sang tài khoản Manager, việc cá nhân của Staff khác không được xuất hiện ở list, search, dashboard, project hay lịch của Manager.

## Việc con

- Trong chi tiết task, cho xem/tạo việc con tối đa 2 cấp. Việc con có status, chủ trì, hạn riêng. Nếu hạn con vượt hạn cha, yêu cầu người có quyền xác nhận điều chỉnh.
- Hoàn thành toàn bộ việc con không tự chuyển task cha `OFFICIAL` sang `DONE`; vẫn cần nộp và duyệt.

## Nhiệm vụ định kỳ (bản xem trước P1)

- Manager tạo/sửa/bật tắt mẫu `RecurrenceRule` hằng tuần hoặc hằng tháng. Hiển thị kỳ tạo tiếp theo và bản xem trước task sẽ sinh.
- Nút demo “Sinh kỳ tiếp theo” tạo một `OFFICIAL` mới và `RecurrenceInstance` với khóa `(ruleId, periodKey)` duy nhất. Bấm lại cùng kỳ không tạo task trùng; không mở lại task cũ đã hoàn thành.

Kết thúc bằng cách kiểm tra lời mời `t10` cho `u05`, lời mời đã từ chối `t11` cho `u04`, việc riêng `t12` cho `u02`, và các dự án `p01`/`p02`.
