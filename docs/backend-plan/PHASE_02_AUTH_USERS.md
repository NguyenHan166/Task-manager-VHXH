# Phase 02 — Xác thực, phiên và quản lý thành viên

**Phụ thuộc:** Phase 01; D-01 đến D-03.  
**Mục tiêu:** Mọi API nghiệp vụ nhận danh tính từ phiên thật và có một policy quyền thống nhất.  
**Cổng qua phase:** 3 vai trò đăng nhập được theo fixture; tài khoản LOCKED không thể dùng phiên; Manager quản trị thành viên mà không làm mất Manager hoạt động cuối cùng.

## Task

### BE-02-01 — Login, refresh, logout và logout-all

- **Phụ thuộc:** BE-01-03, D-02, D-03.
- **Thực hiện:** `POST /api/auth/login`, `refresh`, `logout`, `GET /api/auth/me` và logout-all theo D-02/D-03: email công vụ + mật khẩu nội bộ, access token 15 phút, refresh token xoay vòng trong cookie `HttpOnly`/`Secure` 7 ngày. Hash mật khẩu và refresh token lưu ở server; thu hồi theo phiên và mọi thiết bị. Không cho email tồn tại/không tồn tại lộ qua thông báo đăng nhập. Cập nhật `lastLoginAt` sau đăng nhập thành công. Rate limit theo tài khoản/IP, không dùng localStorage role switch để xác thực.
- **Đầu ra:** Auth module và mô tả vòng đời phiên.
- **Hoàn thành khi:** Token hết hạn/thu hồi/đăng xuất bị `401`; user LOCKED bị từ chối; refresh cũ không tái sử dụng được; log không chứa credential.

### BE-02-02 — Policy RBAC và ACL dùng chung

- **Phụ thuộc:** BE-00-02, BE-02-01.
- **Thực hiện:** Tạo guard cho `MANAGER`, `DEPUTY_MANAGER`, `STAFF` và policy bản ghi dùng trong tasks/files/chat/reports. Định nghĩa quyền đọc danh bạ phục vụ giao việc riêng với quyền vào trang quản trị `/members`. Quyết định một chính sách `403`/`404` chống dò ID và áp dụng nhất quán.
- **Đầu ra:** Policy API, bảng mapping action → rule, helper truy vấn scoped.
- **Hoàn thành khi:** Gọi API trực tiếp bằng STAFF/DEPUTY đến endpoint Manager-only bị từ chối; policy task chưa dựa vào nút FE hoặc actorId client gửi lên.

### BE-02-03 — Hồ sơ và danh bạ người dùng

- **Phụ thuộc:** BE-02-01, BE-02-02.
- **Thực hiện:** `GET /api/auth/me`, cập nhật hồ sơ của chính mình theo trường cho phép, danh sách người dùng phục vụ chọn chủ trì/phối hợp có lọc ACTIVE và phân trang. Không trả hash, session hoặc dữ liệu quản trị vào DTO công khai. Quyền xem workload cá nhân/toàn phòng tuân theo ma trận Phase 00.
- **Đầu ra:** User DTO riêng cho self, directory, admin; OpenAPI cập nhật.
- **Hoàn thành khi:** STAFF chỉ sửa hồ sơ được phép của mình; không tự đổi `role`, `status`, email đăng nhập nếu chính sách yêu cầu admin; danh bạ không liệt kê tài khoản khóa để giao việc mới.

### BE-02-04 — Quản trị tài khoản chỉ MANAGER

- **Phụ thuộc:** BE-02-02, D-01.
- **Thực hiện:** `GET/POST/PATCH /api/users`, reset password, khóa/mở khóa, đổi role, xem chi tiết. Tạo mật khẩu khởi tạo ngẫu nhiên hoặc nhập theo policy; chỉ hiển thị mật khẩu tạm một lần cho người quản trị, không lưu plaintext hay đưa vào thông báo chuông. Kiểm tra self-lock và giữ ít nhất một MANAGER ACTIVE trong transaction có khóa phù hợp để chống hai yêu cầu đồng thời.
- **Đầu ra:** Admin users endpoints và audit event cho thao tác nhạy cảm.
- **Hoàn thành khi:** DEPUTY/STAFF nhận `403`; Manager cuối không thể bị khóa/hạ role ngay cả khi có yêu cầu đồng thời; lịch sử task của user bị khóa vẫn giữ nguyên.

### BE-02-05 — Ma trận kiểm tra bảo mật phiên và quyền

- **Phụ thuộc:** BE-02-01 đến BE-02-04.
- **Thực hiện:** Kiểm tra các ca đăng nhập sai, khóa tài khoản trong lúc có phiên, refresh sau logout, reset password, đổi role khi đang đăng nhập, truy cập `/members` bằng cả 3 vai trò. Ghi rõ liệu đổi role/khóa có thu hồi phiên ngay hay tại request kế tiếp và triển khai đúng quyết định.
- **Đầu ra:** Bằng chứng kiểm tra và các mã lỗi trong OpenAPI.
- **Hoàn thành khi:** Không tồn tại đường API cho phép user tự nâng quyền hoặc dùng phiên cũ sau khi bị khóa.
