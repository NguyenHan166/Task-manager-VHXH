# Prompt 08 — Báo cáo, thành viên, cài đặt và nhật ký

Tiếp tục trên dự án hiện tại. Dựng các màn hình quản lý và báo cáo phục vụ việc kiểm tra UI/UX, cùng lấy dữ liệu từ mock repository.

## Báo cáo (Lãnh đạo: Manager & Deputy Manager)

- Trang báo cáo toàn phòng cho Lãnh đạo (Trưởng phòng và Phó phòng) với bộ lọc thời gian, chủ trì, project, priority, status. Có KPI tổng, đúng hạn/trễ hạn, danh sách quá hạn và chờ duyệt, bảng theo từng người **chủ trì**. Người phối hợp thể hiện ở cột riêng, không cộng trùng một task.
- Báo cáo chính thức mặc định chỉ dùng `OFFICIAL` đã phát hành và không hủy. Cho bật tùy chọn xem thêm `TEAM`, hiển thị rõ rằng số đó nằm ngoài KPI chính thức. Không đưa `PERSONAL` vào báo cáo toàn phòng.
- Xuất CSV từ dữ liệu đã lọc; file có tiêu đề cột tiếng Việt và metadata ngày xuất/người xuất/bộ lọc. Nếu thêm XLSX thì dùng cùng selector, không một công thức riêng. Lãnh đạo (Manager và Deputy Manager) được quyền xuất; Staff chỉ xem thống kê cá nhân và không xuất dữ liệu toàn phòng.
- Tooltip giải thích định nghĩa: `isTaskOverdue`, hoàn thành đúng hạn (`completedAt <= dueAt`), tỷ lệ hoàn thành, khoảng thời gian lọc.

## Quản lý thành viên & Tài khoản hệ thống (Chỉ Trưởng phòng kiêm Quản trị hệ thống)

- **Quyền hạn truy cập**:
  - **Chỉ Trưởng phòng (`MANAGER`)** kiêm Quản trị hệ thống mới có quyền truy cập màn hình `/members`.
  - **Phó phòng (`DEPUTY_MANAGER`) và Chuyên viên (`STAFF`) bị chặn hoàn toàn (mã lỗi 403 Forbidden)**.
- **Thống kê tổng quan đầu trang (StatCards)**:
  - Tổng số thành viên (`users.length`), hiển thị chi tiết số lượng đang hoạt động và số lượng bị khóa.
  - Lãnh đạo đơn vị: số Trưởng phòng (Admin) và Phó phòng.
  - Chuyên viên nghiệp vụ: số Chuyên viên thực hiện & báo cáo.
  - Hiệu suất hoàn thành: Tỷ lệ hoàn thành nhiệm vụ đúng hạn trung bình toàn phòng.
- **Trường thông tin hồ sơ nhân sự chuẩn**:
  - `id`: Mã định danh người dùng (`u01`, `u02`,...).
  - `email`: Email công vụ liên hệ (bắt buộc, đồng thời là **tên đăng nhập chính thức** vào hệ thống, ví dụ: `an.nv@agency.gov.vn`).
  - `username`: Tên đăng nhập hệ thống (đồng bộ 1:1 với `email`).
  - `displayName`: Họ và tên hiển thị đầy đủ.
  - `jobTitle`: Chức danh công việc (ví dụ: Chuyên viên Tổng hợp, Kỹ sư Vận hành).
  - `department`: Tổ / Bộ phận chuyên môn (ví dụ: Tổ Tổng hợp - Kế hoạch, Tổ Kỹ thuật - Vận hành, Lãnh đạo đơn vị).
  - `phoneNumber`: Số điện thoại liên hệ nội bộ / máy lẻ.
  - `role`: Vai trò hệ thống (`MANAGER`, `DEPUTY_MANAGER`, `STAFF`).
  - `status`: Trạng thái tài khoản (`ACTIVE`, `LOCKED`).
  - `createdAt`: Thời điểm tạo tài khoản (ISO UTC).
  - `lastLoginAt`: Thời điểm đăng nhập gần nhất.
- **Bảng danh sách thành viên**:
  - Tối ưu hóa giao diện trực quan, **không hiển thị cột tải công việc ở bảng** để tập trung vào thông tin nhân sự, chức danh, tổ chuyên môn, tài khoản email và các thao tác quản trị. Khi cần xem chi tiết tải công việc và các nhiệm vụ cụ thể, Quản trị viên bấm nút "Xem" để mở modal Chi tiết & Tải công việc.
- **Các nghiệp vụ Quản trị tài khoản chuẩn**:
  1. **Tạo tài khoản mới**: Form nhập Tên đăng nhập / Email công vụ (bắt buộc), Họ và tên hiển thị, Số điện thoại, Tổ bộ phận, Chức danh, Vai trò. Hỗ trợ nhập mật khẩu khởi tạo hoặc tự động sinh mật khẩu tạm thời ngẫu nhiên (ví dụ: `Ows@123456`). Sau khi tạo, modal hiển thị thông tin đăng nhập và hỗ trợ sao chép vào bộ nhớ tạm để gửi cho thành viên.
  2. **Chỉnh sửa hồ sơ & Vai trò hệ thống**:
     - Cho phép cập nhật `displayName`, `jobTitle`, `department`, `email` (tên đăng nhập), `phoneNumber`, và **vai trò (`role`)**.
     - **Quy tắc an toàn**: Nếu tài khoản đang là Trưởng phòng duy nhất còn hoạt động (`activeManagersCount <= 1`), hệ thống **chặn không cho hạ vai trò** của tài khoản này sang Phó phòng hoặc Chuyên viên để tránh mất quyền quản trị hệ thống.
  3. **Đặt lại mật khẩu (Reset Password)**:
     - Quản trị viên có nút "Đặt lại mật khẩu" cho từng thành viên.
     - Cho phép nhập mật khẩu mới hoặc bấm "Sinh mã tự động" để tạo mật khẩu tạm thời.
     - Tự động phát sinh thông báo chuông cho thành viên và cho phép Quản trị viên bấm "Sao chép mật khẩu" gửi trực tiếp.
  4. **Khóa / Mở khóa tài khoản**:
     - Khi bị khóa (`LOCKED`), tài khoản không thể đăng nhập hoặc lựa chọn trong danh sách demo. Dữ liệu công việc, tin nhắn, nhật ký lịch sử đã giao vẫn được bảo lưu toàn vẹn.
     - **Quy tắc an toàn 1 (Self-lock prevention)**: Quản trị viên không thể tự khóa tài khoản của chính mình (`u.id === currentUser.id`).
     - **Quy tắc an toàn 2 (Last active manager)**: Không thể khóa Trưởng phòng hoạt động cuối cùng của hệ thống.
  5. **Xem chi tiết hồ sơ & Thống kê tải công việc (Workload Analytics)**:
     - Modal chi tiết hiển thị đầy đủ thông tin cá nhân, liên hệ, ngày tham gia, ngày đăng nhập cuối.
     - Thống kê tải công việc: Số việc đang chủ trì (Active), số việc đang phối hợp, số việc đã hoàn thành, số việc quá hạn (cảnh báo đỏ nếu > 0), tỷ lệ đúng hạn.
     - Danh sách các công việc mới nhất đang phụ trách kèm trạng thái, hạn hoàn thành và link truy cập chi tiết.

## Cài đặt và nhật ký (Chỉ Trưởng phòng kiêm Quản trị hệ thống)

- Settings có tên phòng, `defaultDueHour`, `reminderBeforeHours`, `maxFileSizeMb`, timezone hiển thị. Đổi settings cập nhật UX liên quan, có validation. **Chỉ Manager kiêm quản trị mới có quyền truy cập màn hình Cài đặt; Phó phòng và Chuyên viên bị chặn 403**.
- Trang nhật ký hiển thị `TaskEvent` theo thời gian, người thao tác, loại hành động, đối tượng và chi tiết trước/sau. Giao diện không có nút sửa/xóa audit. Chức năng xem audit logs và xuất sao lưu JSON thuộc quyền quản trị của Trưởng phòng.
- Profile của tài khoản đang dùng: tên, chức danh, avatar chữ cái, trạng thái; sửa các trường được phép trong mock.
- Nút reset dữ liệu demo đặt trong menu cài đặt với xác nhận rõ rằng thay đổi local sẽ mất.

Kết thúc bằng ví dụ đối chiếu: báo cáo phải có cùng 7 việc chính thức hợp lệ như Dashboard Manager ở seed mặc định; `t05` đúng hạn, `t06` trễ hạn; `t04` quá hạn hiện tại.
