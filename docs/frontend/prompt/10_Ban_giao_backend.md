# Prompt 10 — Bàn giao từ prototype sang backend

Trên dự án đã hoàn thiện UI/UX, hãy tạo tài liệu `docs/FRONTEND_BACKEND_HANDOFF.md` trong dự án Google AI Studio để đội backend triển khai NestJS/PostgreSQL/R2. Dùng **mã và hợp đồng dữ liệu hiện có** làm bằng chứng; không suy đoán màn hình hoặc endpoint chưa được sử dụng.

## Nội dung tài liệu

1. Sơ đồ module frontend và nơi thay `MockRepository` bằng `HttpRepository`; chỉ rõ component/hook nào đã tách khỏi nguồn dữ liệu.
2. Bảng mỗi màn hình/hành động → method repository → endpoint REST dự kiến → request DTO → response type → role/quyền bản ghi → trạng thái lỗi cần hiển thị. Giữ khung API trong PRD (`/api/auth`, `/api/tasks`, `/api/dashboard`, `/api/notifications`, `/api/chat`, `/api/files`).
3. Ghi rõ các entity TypeScript đang dùng trong `data-contract.ts` và đề xuất bảng PostgreSQL tương ứng; giữ `Task`, `TaskParticipant`, `TaskSubmission`, `TaskApproval`, `TaskDeadlineRequest`, `TaskEvent` là các khái niệm riêng để bảo toàn lịch sử.
4. Công thức KPI và lọc phạm vi dữ liệu, đặc biệt `OFFICIAL`/`TEAM`/`PERSONAL`, `DRAFT`/`CANCELLED`, quá hạn và đúng hạn. Nêu một endpoint nào nên trả số liệu tổng hợp để tránh frontend tải mọi task về tính ở production.
5. Quy tắc thời gian: ISO UTC qua API, hiển thị `Asia/Ho_Chi_Minh`, cách xử lý hạn chỉ có ngày, phân trang và sort server-side.
6. Các transition trạng thái và ma trận quyền; chỉ rõ backend phải kiểm tra role + quyền từng task/chat/file. Trường hệ thống (`createdById`, `approvedById`, `completedAt`, `role`, `objectKey`) không nhận từ client một cách tùy ý.
7. Phương án file R2: backend cấp signed PUT/GET URL sau khi kiểm tra quyền, frontend upload trực tiếp, backend xác minh file rồi mới ghi metadata. So sánh với hành vi file mock hiện tại để tránh hiểu nhầm metadata là file thật.
8. Những chỗ mock cần thay bằng giải pháp thật: auth/session, transaction và audit, scheduler nhắc hạn chống trùng, Socket.IO/reconnect, file upload, backup. Đánh dấu quyết định chưa chốt thay vì tự chọn thay người dùng.
9. Danh sách mock scenario `t01`–`t13` và kết quả KPI mong đợi, để backend có fixture đối chiếu khi triển khai.

Đồng thời rà lại source: nếu một màn hình vẫn đọc `mock-seed.ts` trực tiếp, hãy chuyển nó qua repository/selector trước khi bàn giao. Tài liệu phải mô tả đúng code sau khi sửa. Cuối cùng trả đường dẫn tài liệu và tóm tắt các quyết định cần chốt cho backend.
