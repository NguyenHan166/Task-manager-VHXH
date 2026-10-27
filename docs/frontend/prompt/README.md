# Bộ prompt dựng giao diện Office Workspace bằng Google AI Studio

## Mục đích

Dựng một **prototype frontend có thể thao tác** cho ứng dụng quản lý công việc nội bộ. Prototype dùng mock data, cho xem trước đầy đủ các luồng UX, và dùng cùng một hợp đồng dữ liệu để sau này thay mock adapter bằng API NestJS.

Nguồn nghiệp vụ: [`../../TONG_QUAN_UNG_DUNG_QUAN_LY_CONG_VIEC_NOI_BO.md`](../../TONG_QUAN_UNG_DUNG_QUAN_LY_CONG_VIEC_NOI_BO.md). [Ảnh MISA tham chiếu](./misa-reference.png) chỉ dùng để hiểu bố cục và cảm giác giao diện: sidebar, topbar, thẻ tổng quan, biểu đồ và mật độ thông tin. Không sao chép logo, linh vật, màu thương hiệu hoặc thành phần đặc trưng của MISA.

## Cách dùng

1. Tạo một dự án React + TypeScript trong Google AI Studio Build. Bắt đầu **một cuộc hội thoại duy nhất** để các bước sau kế thừa mã đã tạo.
2. Dán toàn bộ `00_Boi_canh_chung.md`. Đính kèm `misa-reference.png` nếu muốn AI Studio nhìn trực tiếp ảnh. Đính kèm hoặc dán nội dung `data-contract.ts` và `mock-seed.ts` cùng lúc. Nếu AI Studio không đọc được tệp cục bộ, dán nội dung hai tệp vào cuộc hội thoại trước Prompt 01.
3. Gửi Prompt 01, rồi **Prompt 01A về style/màu/design system**, sau đó Prompt 02 → 10. Duyệt trang `/ui-kit` sau Prompt 01A trước khi dựng các màn hình. Chờ AI Studio hoàn tất mã của từng bước, xem giao diện và sửa lỗi phát sinh trước khi sang bước kế tiếp. Nếu AI Studio mất ngữ cảnh, gửi lại Prompt 00, Prompt 01A và hai tệp dữ liệu.
4. Sau mỗi bước, yêu cầu AI Studio **sửa trực tiếp dự án đang có**, không tạo dự án mới. Có thể dùng prompt sửa lỗi ở cuối README khi cần.
5. Ở Prompt 10, lấy lại bảng ánh xạ UI → dữ liệu → API để làm đầu vào thiết kế backend.

## Thứ tự prompt

| Tệp | Kết quả cần có |
|---|---|
| `00_Boi_canh_chung.md` | Bối cảnh sản phẩm, ranh giới nghiệp vụ, quy ước giao diện |
| `01_Nen_tang_mock.md` | React app, kiểu dữ liệu, mock repository, phiên demo |
| `01A_He_thong_thiet_ke.md` | Style, bảng màu, typography, lưới, component và trang `/ui-kit` |
| `02_Khung_giao_dien.md` | Shell, điều hướng, đăng nhập demo, responsive |
| `03_Dashboard.md` | Dashboard Trưởng phòng và Chuyên viên, KPI cùng nguồn dữ liệu |
| `04_Danh_sach_chi_tiet_cong_viec.md` | List, Kanban, bộ lọc, chi tiết, bình luận |
| `05_Luong_giao_nop_duyet.md` | Tạo/giao/bắt đầu/nộp/duyệt/trả lại/gia hạn/hủy |
| `06_Du_an_lich_viec.md` | Dự án, lịch, việc nhóm và việc cá nhân |
| `07_Thong_bao_chat_file.md` | Thông báo, chat mock, tệp đính kèm mock |
| `08_Bao_cao_quan_tri.md` | Báo cáo, thành viên, cài đặt, audit |
| `09_Ra_soat_UX.md` | Responsive, accessibility, trạng thái lỗi, tính nhất quán |
| `10_Ban_giao_backend.md` | Kiểm kê màn hình, hợp đồng API và điểm cần chốt |

## Dữ liệu dùng chung

- `data-contract.ts` là **nguồn kiểu dữ liệu duy nhất**. AI Studio sao chép nguyên vào `src/shared/data-contract.ts`; mọi trang và mock repository import từ đây.
- `mock-seed.ts` là **bộ dữ liệu mẫu duy nhất**. AI Studio sao chép vào `src/mocks/mock-seed.ts`, chỉ chỉnh đường dẫn import. Tất cả dashboard, danh sách, chi tiết, lịch, thông báo và báo cáo phải đọc từ cùng kho mock sau khi khởi tạo bằng seed này.
- `API_MAPPING.md` ghi hợp đồng REST dự kiến để so chiếu khi làm backend; Prompt 10 yêu cầu AI Studio cập nhật bản bàn giao theo mã prototype thực tế.
- Ngày trong seed tính tương đối so với thời điểm mở app để các ca sắp đến hạn, quá hạn và hoàn thành đúng/trễ hạn luôn có ý nghĩa. Khi người dùng đổi dữ liệu, cập nhật kho mock rồi tính lại mọi màn hình; không hardcode các số KPI.
- Dữ liệu mock không phải cơ sở dữ liệu thật. Demo có nút **Đặt lại dữ liệu mẫu** và lưu thay đổi trong `localStorage` để reload không mất phiên thử nghiệm.

## Kiểm tra thủ công trước khi nhận kết quả

1. Đổi vai trò demo giữa 3 vai trò `MANAGER`, `DEPUTY_MANAGER` và `STAFF` (bằng thanh Dev Toolbar nổi hoặc trang `/login`); sidebar, quyền thao tác, dữ liệu hiển thị thay đổi đúng. Bấm nút **"🔍 Preview ma trận quyền (3 vai trò)"** trên Dev Toolbar để kiểm tra bảng đối chiếu trực quan.
2. Kiểm tra phân quyền Phó phòng (`DEPUTY_MANAGER`): Phó phòng có toàn quyền giao việc chính thức, duyệt bài, trả lại, gia hạn, xem Dashboard điều hành và Báo cáo toàn phòng như Trưởng phòng; nhưng khi cố truy cập `/members` hoặc `/settings` sẽ bị chặn và hiển thị trang 403 Forbidden nêu rõ lý do (chỉ Trưởng phòng kiêm Quản trị mới có quyền).
3. Trưởng phòng hoặc Phó phòng tạo và giao một việc `OFFICIAL`; chuyên viên chủ trì thấy việc, nộp kết quả; Lãnh đạo duyệt hoặc trả lại; dashboard và thông báo cùng cập nhật.
4. Chuyên viên không tự duyệt, không sửa hạn/chủ trì việc chính thức, không xem việc cá nhân của người khác, không vào được các tính năng lãnh đạo/quản trị.
4. Bộ lọc, Kanban, lịch, báo cáo đều hiển thị từ cùng task store; tổng số không lệch nhau.
5. Thử desktop, tablet và mobile; kiểm tra menu, bảng dữ liệu, form, modal, trạng thái rỗng/lỗi.
6. Đối chiếu màu, font, badge, card và spacing của các trang với Prompt 01A; không để mỗi màn hình tự chọn một hệ màu.

## Prompt sửa lỗi ngắn

> Hãy sửa lỗi sau trong dự án hiện tại: [mô tả lỗi + đường đi tái hiện]. Giữ nguyên `data-contract.ts`, ID seed và quy tắc nghiệp vụ trong Prompt 00. Tìm nguyên nhân, sửa tận gốc, cập nhật các màn hình dùng chung dữ liệu, rồi mô tả ngắn tệp đã sửa và cách tôi kiểm tra lại. Không tạo thêm dữ liệu hardcode hoặc mô phỏng một hành động thành công khi state chưa đổi.
