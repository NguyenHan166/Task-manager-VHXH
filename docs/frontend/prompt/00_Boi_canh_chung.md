# Prompt 00 — Bối cảnh và nguyên tắc chung

Bạn là product designer và frontend engineer. Hãy xây dựng trong **dự án hiện tại** một prototype frontend tiếng Việt, có thể thao tác, cho sản phẩm “Office Workspace”: ứng dụng quản lý công việc nội bộ của một phòng 11–20 người. Mục tiêu là hoàn thiện UI/UX và luồng nghiệp vụ trước khi làm backend. Dùng React + TypeScript + Vite, Tailwind CSS và shadcn/ui; dùng thư viện biểu đồ/phần icon nhẹ nếu dự án có sẵn. Không gọi API thật.

Tôi sẽ cung cấp `data-contract.ts` và `mock-seed.ts`. Hãy coi chúng là nguồn dữ liệu chuẩn. Tạo một mock repository bất đồng bộ để mọi màn hình đọc/ghi cùng một state, có lưu `localStorage`, có reset seed, có độ trễ ngắn mô phỏng API. Không khai báo kiểu hoặc mảng dữ liệu riêng cho từng màn hình. Sau này phải thay được mock repository bằng HTTP adapter mà không sửa component giao diện.

## Mô hình nghiệp vụ bắt buộc

- Chỉ có hai vai trò tài khoản: `MANAGER` (Trưởng phòng, kiêm quản trị) và `STAFF` (Chuyên viên). Không tạo role `ADMIN`.
- Có ba loại việc: `OFFICIAL` (chỉ Manager giao, phải duyệt kết quả, được tính trong KPI phòng), `TEAM` (cộng tác, người được mời có thể nhận/từ chối), `PERSONAL` (riêng tư, không tính KPI phòng).
- Một việc chính thức có đúng một người chủ trì khi phát hành; có thể có nhiều người phối hợp và theo dõi. Staff chỉ đề nghị gia hạn hoặc đổi người, không tự thay đổi hạn/người của `OFFICIAL`.
- Trạng thái: `DRAFT` → `TODO` → `IN_PROGRESS` → `IN_REVIEW` → `DONE`; `CANCELLED` khi hủy. Trả lại kết quả chuyển về `IN_PROGRESS` và lưu lý do. “Quá hạn” được tính từ `dueAt` và trạng thái, không phải status. “Vướng mắc” là cờ/lý do riêng.
- Mỗi lần nộp, duyệt, trả lại, đổi hạn, đổi người, hủy phải giữ lịch sử. `DONE` và `CANCELLED` không nhận nhắc quá hạn.
- Manager xem mọi `OFFICIAL` và quản lý tài khoản; không đưa `PERSONAL` của nhân viên khác vào giao diện Manager. Staff chỉ xem việc được tham gia hoặc do mình tạo. Đây là mô phỏng quyền ở frontend để duyệt UX; hợp đồng backend sau này phải thực thi quyền ở server.
- Giờ hiển thị `Asia/Ho_Chi_Minh`; giá trị thời gian trao đổi với backend dùng ISO 8601 UTC.

## Hướng thiết kế từ ảnh tham chiếu MISA

Tham khảo **cấu trúc**: sidebar dọc, topbar tìm kiếm/thông báo/avatar, lời chào và thẻ tổng quan, biểu đồ donut và danh sách việc cần làm. Thiết kế riêng cho Office Workspace, rõ vai trò, ít trang trí, dễ đọc với 20 người dùng. Không sao chép thương hiệu, linh vật, câu chữ hay screenshot MISA; không thêm tính năng AI trợ lý vào MVP vì đặc tả đặt AI ở giai đoạn sau.

Ưu tiên nền sáng, tương phản tốt, hệ màu cố định cho trạng thái và mức ưu tiên nhưng luôn kèm chữ. Có spacing nhất quán, desktop 1440px đẹp, hoạt động tốt trên 390px mobile. Sidebar desktop, menu thu gọn trên mobile. Dùng text thật tiếng Việt, không lorem ipsum, không số liệu giả gắn trực tiếp vào component.

Sau Prompt 01, tôi sẽ gửi **Prompt 01A — Thiết kế thị giác và design system**. Prompt đó chốt màu hex, font, kích thước, component và bố cục; áp dụng nó cho tất cả màn hình tiếp theo. Khi có khác biệt về style, ưu tiên Prompt 01A.

## Chất lượng tương tác

Mọi nút hiển thị phải có hành động hợp lý. Form có validation và lỗi theo trường; thao tác thành công có toast và state cập nhật; thao tác nguy hiểm có xác nhận. Có loading, empty state, error state. Bảng có tìm kiếm, lọc, phân trang hoặc tải thêm. Biểu đồ và thẻ KPI cùng dùng một phép tính. File upload trong prototype chỉ lưu metadata/tên/tổng dung lượng ở mock store; hiển thị rõ đây là mô phỏng, không giả vờ đã upload R2.

Các bước tiếp theo sẽ chỉ định màn hình và luồng cụ thể. Khi nhận mỗi prompt, hãy sửa mã hiện có, giữ nguyên quy ước này, rồi báo ngắn: đã làm gì, tệp chính đã đổi, cách kiểm tra thủ công và điểm nào còn thiếu.
