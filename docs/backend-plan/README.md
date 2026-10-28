# Kế hoạch triển khai Backend — Office Workspace

**Trạng thái:** Kế hoạch triển khai, chưa phải nhật ký hoàn thành.  
**Phạm vi:** NestJS + PostgreSQL trên Railway, Cloudflare R2 private bucket, REST API và Socket.IO cho ứng dụng một phòng (11–20 người).  
**Mốc phát hành:** P0 sau Phase 08; P1 sau Phase 09. P2 chỉ là backlog.

[Bảng theo dõi 51 task](./TASK_TRACKER.md) dùng để đánh dấu tiến độ và ghi bằng chứng nghiệm thu khi triển khai.

## 1. Tài liệu đầu vào và cách xử lý mâu thuẫn

- [Đặc tả sản phẩm](../TONG_QUAN_UNG_DUNG_QUAN_LY_CONG_VIEC_NOI_BO.md): mục tiêu, nghiệp vụ, quyền, ưu tiên P0/P1/P2.
- [Bàn giao FE → BE](../FRONTEND_BACKEND_HANDOFF.md): endpoint dự kiến, thực thể, KPI, seed, thời gian và R2.
- [API mapping](../frontend/prompt/API_MAPPING.md) và [data contract đang chạy](../../Frontend/src/shared/data-contract.ts): tên trường, request/response đang được FE sử dụng.
- [Mock repository](../../Frontend/src/mocks/mock-repository.ts), [TaskService](../../Frontend/src/features/tasks/task-service.ts), [selectors](../../Frontend/src/features/tasks/task-selectors.ts), [seed](../../Frontend/src/mocks/mock-seed.ts): hành vi prototype để đối chiếu, không tự động là quy tắc bảo mật BE.

Khi nguồn mâu thuẫn, áp dụng các quyết định `D-01`–`D-11` đã được người dùng chốt trong cuộc trò chuyện ngày 27/10/2026 tại [Phase 00](./PHASE_00_CONTRACT.md), rồi cập nhật OpenAPI/migration theo đó. Ma trận 3 vai trò trong đặc tả §2 và tài liệu bàn giao §6.2 là chuẩn cho BE; các đoạn cũ ghi 2 vai trò hoặc chỉ MANAGER điều hành được thay thế bởi D-01. Quyền ở backend phải kiểm tra vai trò **và** quyền trên bản ghi. Việc dùng dữ liệu nghiệp vụ thật trên cloud vẫn cần đơn vị chấp thuận theo D-08.

## 2. Thứ tự thực hiện và điều kiện mở phase

| Phase | Nội dung | Phụ thuộc | Mốc |
|---|---|---|---|
| [00](./PHASE_00_CONTRACT.md) | Chốt nghiệp vụ, quyền, API, quyết định còn mở | Tài liệu FE | Hợp đồng BE được duyệt |
| [01](./PHASE_01_FOUNDATION.md) | Dựng NestJS, cấu hình, PostgreSQL, migration, seed | 00: mô hình lõi | Nền tảng chạy lại được |
| [02](./PHASE_02_AUTH_USERS.md) | Đăng nhập, phiên, RBAC, hồ sơ và quản trị thành viên | 01 | API nhận diện người dùng thật |
| [03](./PHASE_03_TASK_CORE.md) | Nhiệm vụ, người tham gia, đọc/ghi theo quyền, bình luận | 02 | Luồng tạo và xem nhiệm vụ |
| [04](./PHASE_04_OFFICIAL_WORKFLOW.md) | Giao việc, tiến độ, nộp, thu hồi, duyệt, thay đổi, audit | 03 | Luồng OFFICIAL hoàn chỉnh |
| [05](./PHASE_05_FILES.md) | R2 signed URL, metadata, liên kết và tải xuống | 03; nối submission từ 04 | Tệp thật có kiểm soát quyền |
| [06](./PHASE_06_NOTIFICATIONS.md) | Thông báo bền vững, nhắc hạn, Socket.IO | 04; 02 | Nhắc đúng người, không trùng |
| [07](./PHASE_07_REPORTS_OPERATIONS.md) | KPI, báo cáo, cài đặt, audit quản trị, backup | 04; 06 | Số liệu và vận hành P0 |
| [08](./PHASE_08_INTEGRATION_RELEASE.md) | Gắn FE, nghiệm thu, triển khai P0 | 02–07 | P0 dùng được |
| [09](./PHASE_09_P1_COLLABORATION.md) | TEAM/PERSONAL, dự án, lịch, yêu cầu thay đổi, định kỳ, chat | P0 | P1 dùng được |

Phase 05 có thể phát triển song song với phần cuối Phase 04 sau khi ACL nhiệm vụ của Phase 03 ổn định. Phase 06 có thể bắt đầu ngay khi các event nghiệp vụ của Phase 04 đã được định nghĩa. Các phase vẫn có cổng nghiệm thu riêng.

## 3. Quy ước task và Definition of Done

Mỗi task có mã `BE-<phase>-<số>`. Ô `Phụ thuộc` chỉ đến task phải hoàn thành trước. Mỗi task chỉ được đánh dấu xong trong [bảng theo dõi](./TASK_TRACKER.md) khi đầu ra, điều kiện kiểm tra và tài liệu đi kèm đều có. Phase 00–05 đã hoàn thành với [bằng chứng hợp đồng](./phase-00/ACCEPTANCE.md), [nền tảng](./phase-01/ACCEPTANCE.md), [auth/users](./phase-02/ACCEPTANCE.md), [task core](./phase-03/ACCEPTANCE.md), [workflow OFFICIAL](./phase-04/ACCEPTANCE.md) và [file lifecycle R2](./phase-05/ACCEPTANCE.md). Phase 06–09 chưa bắt đầu.

Áp dụng cho mọi API hoặc job:

1. DTO chỉ nhận trường được phép; server tự gán `actorId`, `createdById`, `approvedById`, `completedAt`, `objectKey` và trạng thái hệ thống.
2. Guard vai trò và ACL bản ghi được kiểm tra tại truy vấn/command, kể cả khi FE ẩn nút. `PERSONAL` không rò qua list, search, số liệu, file hoặc socket.
3. Response, mã lỗi `401/403/404/409/422` (hoặc chuẩn đã chốt ở Phase 00), phân trang và thời gian UTC khớp OpenAPI.
4. Thay đổi nhiều bảng dùng transaction; event/audit và notification lưu bền trước khi phát socket. Command lặp hoặc tranh chấp đồng thời có hành vi đã định nghĩa.
5. Migration, seed/fixture, kiểm tra quyền và ca biên, tài liệu endpoint, log có ngữ cảnh và cách vận hành được cập nhật cùng tính năng.
6. Ghi lại cách chạy và bằng chứng nghiệm thu trong PR hoặc phiếu task; không coi demo từ mock là bằng chứng API thật hoạt động.

## 4. Mốc nghiệm thu

**P0:** Đăng nhập an toàn; một MANAGER và một STAFF đi trọn luồng giao → làm → nộp → duyệt/trả lại; DEPUTY_MANAGER có quyền điều hành theo D-01; file R2 thật; thông báo/nhắc hạn bền vững; Dashboard và xuất báo cáo khớp seed; quản trị và backup/restore kiểm chứng; FE hoạt động với API thật. Yêu cầu gia hạn/đổi chủ trì thuộc P1 theo D-11.

**P1:** Dự án/lịch/việc nhóm/việc cá nhân/việc con/định kỳ/chat tuân thủ cùng ACL và dữ liệu lịch sử; socket mất kết nối có thể lấy phần bỏ lỡ qua API.

**P2 backlog:** Phê duyệt nhiều bước, Gantt/phụ thuộc, tích hợp email/Zalo, tài liệu cộng tác, AI, scale ngang/queue. Chỉ đưa vào kế hoạch thực thi khi có yêu cầu riêng và quyết định dữ liệu/chi phí.
