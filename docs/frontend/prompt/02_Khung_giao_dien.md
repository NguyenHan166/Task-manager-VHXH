# Prompt 02 — Khung giao diện, điều hướng và phiên demo

Tiếp tục sửa dự án hiện tại, giữ Prompt 00, Prompt 01A và hợp đồng dữ liệu. Thiết kế app shell dựa trên tinh thần bố cục của ảnh MISA: sidebar bên trái, topbar gọn, khu nội dung có card và khoảng trắng dễ đọc. Dùng **đúng token, typography, kích thước, component và trạng thái responsive của Prompt 01A** cho nhận diện riêng của “Office Workspace”.

## Màn hình và thành phần

- Trang vào ứng dụng cho phép chọn tài khoản demo Manager hoặc Staff. Có mô tả ngắn “Bản xem trước với dữ liệu mẫu”. Sau khi chọn, vào Dashboard đúng vai trò.
- Sidebar Manager: Tổng quan, Tất cả công việc, Giao việc, Chờ duyệt, Dự án, Lịch, Tin nhắn, Báo cáo, Thành viên, Cài đặt/Nhật ký.
- Sidebar Staff: Tổng quan của tôi, Công việc của tôi, Việc cá nhân, Lịch của tôi, Tin nhắn, Thông báo, Hồ sơ.
- Topbar: tìm nhanh theo tiêu đề/mã công việc, chuông thông báo với unread count từ store, tên + avatar chữ cái, menu tài khoản, chuyển tài khoản demo, reset dữ liệu mẫu.
- Breadcrumb và tiêu đề trang có mô tả ngắn. Route chưa làm phải có trạng thái “Sắp hoàn thiện trong bước tiếp theo”, không là màn hình trắng hoặc link chết.
- Bố cục responsive: sidebar cố định trên desktop, drawer điều hướng trên mobile, topbar không bị tràn ở 390px. Có thể dùng skeleton trong lúc mock service tải dữ liệu.

## Quy tắc điều hướng

- Dùng route có đường dẫn ổn định, ví dụ `/dashboard`, `/tasks`, `/tasks/:id`, `/approvals`, `/projects`, `/calendar`, `/chat`, `/reports`, `/members`, `/settings`, `/notifications`, `/profile`.
- Vào route sai quyền phải hiển thị trang 403 dễ hiểu và nút quay lại, không render dữ liệu trái quyền.
- Thông báo hoặc kết quả tìm kiếm mở đúng chi tiết nhiệm vụ nếu tài khoản được xem; nếu không, hiển thị 403.
- Menu và heading dùng ngôn ngữ nghiệp vụ tiếng Việt, trạng thái đi kèm text và biểu tượng; không phụ thuộc riêng vào màu.

Kết thúc bằng việc rà lại toàn bộ liên kết sidebar/topbar và mô tả cách đổi tài khoản demo để xem hai góc nhìn.
