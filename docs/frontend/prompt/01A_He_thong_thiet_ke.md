# Prompt 01A — Thiết kế thị giác và design system

Tiếp tục **dự án hiện tại** sau Prompt 01. Đây là chỉ dẫn thiết kế bắt buộc cho mọi màn hình ở các prompt tiếp theo. Hãy tạo token giao diện và bộ component dùng chung ngay bây giờ; sau đó áp dụng nhất quán cho app shell, dashboard, danh sách, form, lịch, báo cáo và chat. Ảnh `misa-reference.png` là tham chiếu về bố cục dashboard: sidebar trái, topbar, thẻ tổng quan, donut chart và danh sách việc. Sản phẩm mang tên **Office Workspace** với diện mạo riêng, rõ ràng và chuyên nghiệp cho môi trường công sở Việt Nam.

## 1. Phong cách tổng thể

- Từ khóa: **gọn, sáng, đáng tin cậy, dễ quét thông tin, hiện đại vừa phải**. Mật độ thông tin trung bình: hiển thị đủ số liệu để điều hành nhưng không nhồi quá nhiều chi tiết lên một card.
- Nền app xám rất nhạt, bề mặt nội dung trắng. Dùng xanh ngọc đậm làm màu thương hiệu và hành động chính; các màu trạng thái chỉ dùng đúng ngữ nghĩa.
- Các card phẳng, viền mảnh, bóng rất nhẹ. Dùng gradient xanh ngọc nhạt ở **một** khu lời chào/giới thiệu trên dashboard nếu hợp bố cục; các bảng và biểu đồ giữ nền trắng để dễ đọc.
- Không dùng linh vật, hình AI, viền cầu vồng hoặc nhiều gradient như ảnh tham khảo. Biểu tượng dùng cùng một bộ Lucide với nét 1.8–2px.

## 2. Bảng màu cố định

Tạo CSS variables hoặc Tailwind tokens có **đúng tên và giá trị** sau, rồi map vào theme của shadcn/ui. Không tự chọn màu khác ở từng trang.

| Token | Hex | Dùng cho |
|---|---|---|
| `brand-700` | `#0F766E` | Nút chính, link chính, sidebar active, focus |
| `brand-800` | `#115E59` | Hover của nút chính |
| `brand-100` | `#CCFBF1` | Nền nhấn rất nhẹ, chip active |
| `brand-50` | `#F0FDFA` | Nền khu lời chào, hover nhạt |
| `canvas` | `#F7F9FB` | Nền toàn app |
| `surface` | `#FFFFFF` | Card, sidebar, topbar, dialog |
| `text-primary` | `#0F172A` | Tiêu đề, dữ liệu chính |
| `text-secondary` | `#475569` | Nội dung phụ |
| `text-muted` | `#64748B` | Chú thích, placeholder |
| `border` | `#E2E8F0` | Viền card, input, bảng |
| `info` | `#2563EB` | Trạng thái cần làm/thông tin |
| `success` | `#15803D` | Hoàn thành/thành công |
| `warning` | `#B45309` | Đang làm/cần chú ý |
| `danger` | `#B91C1C` | Quá hạn/lỗi/hành động hủy |
| `review` | `#7C3AED` | Chờ duyệt |

Màu trạng thái cho badge và biểu đồ phải **giống nhau** trên mọi màn hình:

| Trạng thái | Chữ/icon | Nền badge |
|---|---|---|
| `DRAFT` Nháp | `#475569` | `#F1F5F9` |
| `TODO` Chưa làm | `#1D4ED8` | `#DBEAFE` |
| `IN_PROGRESS` Đang làm | `#B45309` | `#FEF3C7` |
| `IN_REVIEW` Chờ duyệt | `#7C3AED` | `#F3E8FF` |
| `DONE` Hoàn thành | `#15803D` | `#DCFCE7` |
| `CANCELLED` Đã hủy | `#64748B` | `#E2E8F0` |

“Quá hạn” là nhãn cảnh báo riêng màu `danger`, đặt cạnh trạng thái hiện tại. Mức ưu tiên dùng nhãn: Thấp xám, Bình thường xanh lam, Cao cam, Khẩn đỏ. Loại việc dùng chip riêng: Chính thức xanh ngọc nhạt, Nhóm tím nhạt, Cá nhân xám nhạt. Luôn có chữ, không chỉ dùng màu.

## 3. Typography và nhịp bố cục

- Font: `Be Vietnam Pro` nếu tải được, fallback `Inter`, `system-ui`, `sans-serif`. Kiểm tra dấu tiếng Việt ở cả chữ đậm và chữ nhỏ.
- H1 trang: 28px/36px, weight 700; H2 khu vực: 20px/28px, weight 650 hoặc 600; H3 card: 16px/24px, weight 600; body: 14px/22px, weight 400–500; nhãn phụ: 12px/18px. Số KPI: 28–32px, weight 700, tabular numerals.
- Thang khoảng cách: 4 / 8 / 12 / 16 / 20 / 24 / 32px. Khoảng giữa các khu dashboard 24px; card padding 20–24px; khoảng giữa nhãn và giá trị 6–8px.
- Sidebar desktop rộng 248px; topbar cao 64px; content max-width 1440px. Padding nội dung 32px desktop, 20px tablet, 16px mobile.
- Bo góc: card 14px, input/button 10px, badge dạng pill. Viền 1px `border`; bóng card nhẹ như `0 2px 8px rgba(15,23,42,.04)`.
- Nút chính cao 40px, nút compact 36px, input cao 40px. Hàng bảng khoảng 52px; header bảng 44px. Click target tối thiểu 40×40px.

## 4. Component cần tạo và dùng lại

Tạo hoặc cấu hình các component: `AppShell`, `PageHeader`, `SectionHeader`, `StatCard`, `StatusBadge`, `PriorityBadge`, `TaskTypeBadge`, `UserAvatar`, `EmptyState`, `ErrorState`, `SkeletonCard`, `ConfirmDialog`, `FilterBar`, `DataTable`, `TaskCard`, `TimelineItem`. Các component nhận dữ liệu/variant qua props, không chứa số liệu mock bên trong.

- **Sidebar:** logo chữ/biểu tượng đơn giản của Office Workspace, mục active có nền `brand-50`, chữ `brand-700`, vạch trái 3px; icon 18px, nhãn 14px. Nhóm menu có khoảng cách rõ ràng. Không để tất cả mục cùng đậm.
- **Topbar:** ô tìm kiếm tối đa khoảng 320px trên desktop; chuông thông báo, avatar và menu tài khoản ở góc phải. Border-bottom mảnh. Mobile chỉ giữ các thao tác quan trọng, mở tìm kiếm thành ô riêng khi bấm.
- **Card KPI:** icon trong ô nền nhạt, nhãn phía trên, số lớn, mô tả nhỏ; card có hover nhẹ nếu bấm được. Không thêm xu hướng tăng/giảm khi không có dữ liệu so sánh thật.
- **Bảng công việc:** tiêu đề task đậm vừa, metadata phụ nhỏ hơn; trạng thái/ưu tiên là badge; row hover `brand-50`; nút thao tác đặt ở cuối hàng. Tên dài được cắt có tooltip hoặc mở rộng hợp lý.
- **Form:** label ở trên, dấu bắt buộc rõ, mô tả ngắn dưới trường khi cần; lỗi ngay dưới input. Một cột trên mobile, tối đa hai cột cho trường ngắn trên desktop. Hành động chính ở cuối form, hành động hủy rõ ràng.
- **Dialog/drawer:** form tạo hoặc sửa công việc dùng drawer rộng khoảng 640px trên desktop; xác nhận hủy/duyệt/trả lại dùng dialog gọn. Giữ hành động cuối form nhìn thấy khi cuộn dài.

## 5. Bố cục mẫu theo màn hình

- **Dashboard Manager ở 1440px:** hàng đầu là lời chào bên trái và nút “Giao việc” bên phải; dưới là 6 KPI theo lưới 3 cột × 2 hàng hoặc 6 cột nếu còn đủ chỗ. Khu tiếp theo 7/5 cột: danh sách “Cần xử lý ngay” và donut trạng thái. Phía dưới là “Chờ duyệt” và phân bổ theo chủ trì. Trình tự đọc: việc cần xử lý → tình hình chung → chi tiết.
- **Dashboard Staff:** lời chào và ngày hiện tại, KPI cá nhân, danh sách “Việc của tôi hôm nay”, lịch tuần nhỏ; việc cá nhân nằm ở card riêng có nhãn “Riêng tư”.
- **Danh sách công việc:** page header + nút tạo, thanh tìm kiếm/lọc, tab List/Kanban, vùng dữ liệu. Bộ lọc không che bảng; trên mobile mở trong sheet.
- **Chi tiết công việc:** 2 cột desktop khoảng 8/4: nội dung, kết quả, bình luận, lịch sử ở trái; người phụ trách, hạn, tiến độ, hành động ở phải. Mobile xếp dọc, các hành động chính vẫn dễ thấy.
- **Báo cáo:** bộ lọc trên cùng, KPI tổng, biểu đồ, bảng chi tiết; biểu đồ có legend và số thật lấy từ selector.
- **Chat:** danh sách hội thoại trái, nội dung chat phải; mobile dùng hai màn liên tiếp để đủ không gian đọc.

## 6. Responsive và trạng thái tương tác

- Desktop ≥1280px dùng grid 12 cột; tablet 768–1279px giảm số cột; mobile <768px một cột. Sidebar thành drawer trên mobile; bảng có chế độ card list hoặc cuộn ngang có chủ đích, không cắt mất cột quan trọng.
- Hover 150ms, focus ring 2px `brand-700`, disabled rõ ràng; tôn trọng `prefers-reduced-motion`. Toast và tooltip không che nút chính.
- Chữ thường phải đạt tương phản tối thiểu WCAG AA 4.5:1; kiểm tra các badge nền nhạt. Form và dialog dùng được bằng bàn phím.
- Có thiết kế cụ thể cho loading, empty, error, success và 403/404; dùng cùng màu và kiểu component.

## Việc phải làm ngay ở bước này

1. Tạo token trong `src/styles/tokens.css` hoặc cấu hình Tailwind tương đương, map vào shadcn/ui.
2. Tạo một trang `/ui-kit` chỉ để duyệt thiết kế, thể hiện bảng màu, typography, button, input, card KPI, badge trạng thái/ưu tiên/loại việc, bảng mẫu, empty state, dialog và toast. Trang này dùng dữ liệu từ seed hoặc ví dụ component, không tạo bộ task riêng.
3. Áp dụng token vào trang tạm và các thành phần đã có từ Prompt 01. Các Prompt 02–09 phải dùng lại đúng component/token này.

Kết thúc bằng danh sách token đã tạo, đường dẫn `/ui-kit`, và mô tả màn hình ở 1440px và 390px để tôi duyệt trước khi đi tiếp.
