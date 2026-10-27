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

## Nhiệm vụ định kỳ (Recurrence Rules)

- **Phân quyền & Truy cập**: Cả 3 vai trò đều có quyền truy cập màn hình `/recurrence`. Lãnh đạo (Manager và Deputy Manager) có quyền Quản trị & Điều hành CRUD; Chuyên viên (Staff) có quyền theo dõi các mẫu định kỳ được giao và **trực tiếp nộp báo cáo kết quả** ngay trên giao diện.
- **Phạm vi giao việc linh hoạt**:
  + `scope: "ALL"`: Giao cho **cả phòng** (Toàn bộ chuyên viên trong đơn vị). Khi sinh kỳ mới, hệ thống tự động sinh nhiệm vụ riêng cho từng chuyên viên để mỗi người tự giác nộp báo cáo.
  + `scope: "CUSTOM"`: Giao cho **nhiều chuyên viên cụ thể** qua danh sách `assigneeIds`.
- **Thao tác Quản trị CRUD (Lãnh đạo: Manager & Deputy Manager)**:
  + **Tạo mới (Create)**: Chọn tên mẫu, tần suất (`WEEKLY` / `MONTHLY`), mức ưu tiên, phạm vi (Cả phòng / Danh sách chuyên viên), hạn nộp sau khi sinh (giờ), hướng dẫn nộp báo cáo.
  + **Chỉnh sửa (Update)**: Cho phép sửa đổi toàn bộ thông tin mẫu định kỳ, phạm vi phân công và hạn nộp.
  + **Xóa (Delete)**: Xóa mẫu định kỳ khỏi lịch lặp, bảo lưu các nhiệm vụ kỳ trước đã phát hành.
  + **Bật / Tắt**: Tạm dừng hoặc kích hoạt lại mẫu lặp bất kỳ lúc nào.
  + **Phát hành kỳ tiếp theo (Manual Trigger)**: Sinh ngay nhiệm vụ cho kỳ tới, kiểm tra chống sinh trùng lặp theo khóa `(ruleId, periodKey)`.
- **Nghiệp vụ Chuyên viên nộp báo cáo trực tiếp**:
  + Chuyên viên theo dõi tiến độ nộp của bản thân theo từng kỳ (`TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`).
  + Với các nhiệm vụ chưa nộp, Chuyên viên bấm nút **"Báo cáo kỳ này"** để mở form nộp báo cáo trực tiếp ngay trên trang Nhiệm vụ định kỳ (nhập tóm tắt kết quả, liên kết sản phẩm, ghi chú gửi Lãnh đạo).
  + Sau khi gửi, nhiệm vụ chuyển sang `IN_REVIEW`, phát thông báo cho Lãnh đạo duyệt; Chuyên viên có thể bấm xem lại nội dung đã nộp bất kỳ lúc nào.

Kết thúc bằng cách kiểm tra lời mời `t10` cho `u05`, lời mời đã từ chối `t11` cho `u04`, việc riêng `t12` cho `u02`, và các dự án `p01`/`p02`.
