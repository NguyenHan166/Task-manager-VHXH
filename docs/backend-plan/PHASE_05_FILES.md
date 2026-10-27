# Phase 05 — Tệp thật qua Cloudflare R2

**Phụ thuộc:** ACL task Phase 03; Phase 04 để gắn file vào submission.  
**Mục tiêu:** Upload/download trực tiếp với R2 private bucket, metadata PostgreSQL và quyền theo đối tượng liên kết.  
**Cổng qua phase:** File được upload, xác minh, gắn với task/submission và tải xuống bởi người có quyền; người ngoài không thể lấy signed URL; upload dở không hiện là READY.

## Task

### BE-05-01 — Storage model, config và CORS bucket

- **Phụ thuộc:** BE-00-03, BE-01-03, D-06.
- **Thực hiện:** Áp dụng D-06/D-10: BE dùng `UPLOADING/READY/REMOVED`, ánh xạ `MOCK_LOCAL` chỉ cho FE demo; file tạm gắn với TASK trước khi có submission ID và chỉ được liên kết với SUBMISSION lúc gửi duyệt. Cấu hình bucket private, credentials server-only, CORS cho origin FE và PUT headers; TTL URL ngắn, giới hạn mặc định 20 MB và MIME allowlist.
- **Đầu ra:** Migration/status, config, runbook bucket và danh sách MIME.
- **Hoàn thành khi:** Không có R2 secret trong FE hoặc log; bucket không cho đọc công khai.

### BE-05-02 — Cấp signed PUT URL

- **Phụ thuộc:** BE-05-01, BE-03-01.
- **Thực hiện:** `POST /api/files/upload-url` kiểm tra session, quyền ghi trên task/submission/comment (MESSAGE ở P1), tên/MIME/size/giới hạn số file. Backend tự sinh objectKey khó đoán và fileId, lưu trạng thái UPLOADING, cấp URL chỉ cho key/method/content-type đã định. Không dùng `uploadedById`, `objectKey` từ body.
- **Đầu ra:** Endpoint và response upload đã chốt trong OpenAPI.
- **Hoàn thành khi:** Không thể xin URL cho task không có quyền; file quá hạn/mime sai bị chặn trước khi cấp URL; URL chỉ dùng trong TTL.

### BE-05-03 — Complete, verify và liên kết file

- **Phụ thuộc:** BE-05-02, BE-04-02.
- **Thực hiện:** `POST /api/files/complete` xác minh fileId thuộc actor, HEAD object R2, kích thước thực và trạng thái; không coi `Content-Type` do client đặt hoặc ETag là bằng chứng nội dung thật. Chốt cách kiểm tra loại tệp thực tế (ví dụ đọc phần đầu object bằng range request và kiểm tra định dạng) cùng chính sách checksum trước khi READY. Tạo FileLink trong transaction cho TASK hoặc chuyển file tạm sang SUBMISSION khi submit, không để file của user/task khác vào `fileIds`. Complete lặp an toàn.
- **Đầu ra:** Metadata READY và liên kết tới entity hợp lệ.
- **Hoàn thành khi:** Upload thất bại không tạo READY; size/MIME client khai khác thực tế bị xử lý theo policy; submit không tham chiếu file chưa READY.

### BE-05-04 — Download, gỡ liên kết và dọn file rác

- **Phụ thuộc:** BE-05-03, D-06.
- **Thực hiện:** `GET /api/files/:id/download-url` xác minh quyền xem entity hiện tại rồi cấp signed GET URL ngắn hạn; `GET /api/files` lọc theo ACL trước phân trang. Gỡ file/link theo uploader hoặc lãnh đạo trong phạm vi được phép, đánh dấu `REMOVED` và giữ audit. Job dọn UPLOADING quá hạn; chỉ xóa object không còn liên kết hợp lệ sau 90 ngày kể từ khi gỡ, trừ hồ sơ phải giữ lâu hơn theo quy định đơn vị. Job có log/giới hạn batch.
- **Đầu ra:** Download/list/remove API và cleanup job.
- **Hoàn thành khi:** Thu hồi quyền task dẫn tới không cấp URL mới; user không dò metadata file ngoài quyền; cleanup không xóa object còn link hợp lệ.

### BE-05-05 — Kịch bản R2 và lỗi thực tế

- **Phụ thuộc:** BE-05-01 đến BE-05-04.
- **Thực hiện:** Kiểm tra file hợp lệ, >20 MB, MIME bị cấm, upload gián đoạn, URL hết hạn, complete hai lần, mất liên kết, file thuộc task riêng của người khác, file submission đã thu hồi. Đảm bảo backend không proxy bytes upload/download qua RAM.
- **Đầu ra:** Bảng nghiệm thu và hướng dẫn xử lý file dở.
- **Hoàn thành khi:** Mọi file READY có object thật; lỗi R2 không biến thành thông báo upload thành công giả.
