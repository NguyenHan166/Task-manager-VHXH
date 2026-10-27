# Prompt 05 — Luồng giao việc, nộp và duyệt kết quả

Tiếp tục trên dự án hiện tại. Hoàn thiện toàn bộ tương tác cốt lõi cho nhiệm vụ `OFFICIAL`, dùng chính `Task`, `TaskSubmission`, `TaskApproval`, `TaskDeadlineRequest`, `TaskEvent`, `Notification` trong hợp đồng dữ liệu. Mọi mutation cần cập nhật mock store **một lần như một giao dịch**: task, lịch sử, thông báo và các danh sách liên quan cùng đổi hoặc cùng báo lỗi.

## Lãnh đạo phòng (Manager & Deputy Manager)

1. Tạo bản nháp `OFFICIAL` với tên, mô tả, đầu ra, một chủ trì, nhiều phối hợp/theo dõi, deadline, priority, project. Chưa đủ thông tin vẫn lưu nháp được; trước khi **Giao việc** bắt buộc có tên, một chủ trì hợp lệ, hạn hợp lệ.
2. Bấm Giao việc: `DRAFT → TODO`, ghi `assignedAt`, event `PUBLISHED`, notification cho chủ trì/phối hợp. Form có xác nhận tóm tắt người nhận và hạn.
3. Tại `IN_REVIEW`, mở hồ sơ kết quả rồi **Duyệt** hoặc **Trả lại**. Duyệt tạo approval, `DONE`, `completedAt`, `approvedById`, `approvedAt`. Trả lại bắt buộc lý do, tạo approval `RETURNED`, chuyển về `IN_PROGRESS`, thông báo chủ trì. Giữ toàn bộ submission và approval cũ.
4. Đổi hạn/chủ trì/ưu tiên sau khi giao: bắt buộc nhập lý do, ghi event giá trị trước/sau, gửi thông báo phù hợp. Trưởng phòng và Phó phòng đều có quyền thực hiện với `OFFICIAL`.
5. Hủy nhiệm vụ: bắt buộc lý do, xác nhận, `CANCELLED`, giữ lịch sử. Mở lại việc `DONE` cần lý do và lưu event; không âm thầm ghi đè kết quả đã được duyệt.
6. Quyết định yêu cầu gia hạn: duyệt hoặc từ chối, có lý do quyết định; nếu duyệt thì đổi `dueAt`, lưu hạn cũ trong event, phát thông báo.
7. Quyết định đề nghị đổi XLC: duyệt hoặc từ chối, có lý do; nếu duyệt thì đổi `primaryAssigneeId`, ghi event trước/sau, cập nhật quyền người cũ/người mới và thông báo.

## Staff chủ trì

1. Tại `TODO`, bấm **Bắt đầu** → `IN_PROGRESS`.
2. Cập nhật tiến độ 0–100 và đánh dấu/bỏ vướng mắc; nếu vướng mắc phải nhập lý do. Người phối hợp chỉ bình luận/đính kèm, không thay mặt chủ trì cập nhật tiến độ hay nộp kết quả.
3. Tại `IN_PROGRESS`, bấm **Nộp kết quả / Gửi duyệt**:
   - Form nộp báo cáo kết quả hoàn thành với đầy đủ các trường chuẩn nghiệp vụ:
     + Tham chiếu yêu cầu sản phẩm đầu ra đã giao (`deliverable`) và hạn chót.
     + **Tóm tắt kết quả hoàn thành** (`summary` - bắt buộc): Khái quát các nội dung chính đã đạt được.
     + **Chi tiết kết quả & Khối lượng công việc đạt được** (`details` - tùy chọn): Số liệu định lượng, chỉ tiêu hoặc khối lượng công việc cụ thể đã hoàn thành.
     + **Đường link sản phẩm / Kho lưu trữ trực tuyến** (`deliverableUrl` - tùy chọn): Link Google Drive, OneDrive hoặc kho tài liệu số.
     + **Tự đánh giá & Kiến nghị** (`notes` - tùy chọn): Nhận xét về chất lượng, khó khăn tồn đọng hoặc đề xuất tới Trưởng phòng.
     + **Tệp tài liệu đính kèm kết quả** (`fileIds`): Cho phép chọn/kéo thả nhiều tệp (PDF, Word, Excel, PowerPoint, Ảnh - tối đa 20 MB/tệp) kèm thông tin dung lượng và nút xóa tệp trước khi nộp.
   - Khi nộp: Tải và liên kết tệp đính kèm với `SUBMISSION` và `TASK`, tạo `TaskSubmission` mới, cập nhật tiến độ đạt 100%, chuyển trạng thái sang `IN_REVIEW`, ghi sự kiện `SUBMITTED`, gửi thông báo tới Trưởng phòng. Khi bị trả lại, cho phép xem lại hồ sơ cũ, chỉnh sửa và nộp đợt tiếp theo.
4. **Thu hồi báo cáo / Rút lại kết quả nộp** (khi ở `IN_REVIEW`):
   - Khi công việc đang ở trạng thái Chờ duyệt (`IN_REVIEW`) và Lãnh đạo chưa ra quyết định duyệt/trả lại, chuyên viên chủ trì có quyền bấm **Thu hồi báo cáo** (có tại thanh tác vụ đầu trang, banner thông báo và tab Kết quả nộp).
   - Modal xác nhận cho phép nhập lý do thu hồi (tùy chọn).
   - Hệ thống chuyển `submission.status = "WITHDRAWN"`, lưu `withdrawnAt` và `withdrawnReason`.
   - Trạng thái công việc quay trở về `IN_PROGRESS` (tiến độ trở lại 90%), ghi sự kiện audit `SUBMISSION_WITHDRAWN`, gửi thông báo tới Trưởng phòng.
   - Chuyên viên có thể tiếp tục cập nhật tiến độ, đính kèm thêm file hoặc chỉnh sửa nội dung và nộp duyệt lại (tạo đợt nộp mới `#2`, `#3`...).
5. Tạo yêu cầu gia hạn với hạn đề xuất lớn hơn hạn hiện tại và lý do. Chưa được Manager duyệt thì `dueAt` không thay đổi.
6. Có thể đề nghị đổi chủ trì bằng `TaskAssigneeRequest` với người đề xuất và lý do; chỉ Manager quyết định, trước khi duyệt thì `primaryAssigneeId` không đổi.

## Quy tắc UX và dữ liệu

- Một thao tác chỉ hiện nếu đúng role, quyền với task và trạng thái; service mock cũng kiểm tra và trả `AppError` nếu bị gọi trực tiếp.
- Có loading, validation tại form, lỗi conflict nếu state đã đổi, toast thành công; không tự động chuyển trạng thái bằng việc sửa trường trên UI.
- Mọi thay đổi đồng bộ ngay ở Dashboard, list/Kanban, chi tiết, chuông thông báo và báo cáo.
- Dùng các trường ISO UTC trong store, hiển thị giờ Việt Nam. Không xóa cứng một nhiệm vụ đã phát hành.

Hãy mô tả ngắn luồng tôi có thể bấm từ `u01` tạo việc → `u02` thực hiện/nộp → `u01` trả lại/duyệt, và chỉ rõ dữ liệu nào đổi sau từng bước.
