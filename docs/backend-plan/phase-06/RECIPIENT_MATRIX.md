# Phase 06 — Ma trận người nhận

Mọi recipient phải đang `ACTIVE`; actor không tự nhận notification của thao tác mình. Workflow chính thức lấy assignee/submitter từ trạng thái đã commit trong cùng transaction với `TaskEvent`, `Notification` và `RealtimeOutbox`.

| Sự kiện | Người nhận | Notification | Khóa chống trùng |
|---|---|---|---|
| Phát hành | Primary assignee hiện tại | `TASK_ASSIGNED` | `TaskEvent.id + recipientId` |
| Bình luận OFFICIAL | Lãnh đạo đang ACTIVE, creator, primary assignee và participant đã ACCEPTED; loại actor | `COMMENT_ADDED` | `TaskEvent.id + recipientId` |
| Nộp kết quả | Lãnh đạo đang ACTIVE, loại người nộp | `SUBMISSION_RECEIVED` | `TaskEvent.id + recipientId` |
| Thu hồi kết quả | Lãnh đạo đang ACTIVE, loại người thu hồi | `SUBMISSION_WITHDRAWN` | `TaskEvent.id + recipientId` |
| Duyệt / trả kết quả | Tác giả submission và primary assignee hiện tại; loại người quyết định | `SUBMISSION_APPROVED` / `SUBMISSION_RETURNED` | `TaskEvent.id + recipientId` |
| Điều chỉnh task | Assignee mới và cũ khi đổi người; nếu không đổi thì assignee hiện tại | `TASK_ASSIGNED` / `TASK_UPDATED` | `TaskEvent.id + recipientId` |
| Nhắc trước hạn / đến hạn | Primary assignee đang ACTIVE | `TASK_DUE_SOON` / `TASK_DUE` | Task + recipient + loại mốc + `dueAt` ISO |
| Quá hạn mỗi ngày | Assignee đang ACTIVE nếu không phải lãnh đạo | `TASK_OVERDUE` | Task + recipient + `YYYY-MM-DD` Việt Nam |
| Tổng hợp quá hạn | Mỗi lãnh đạo đang ACTIVE, một notification cho các OFFICIAL quá hạn | `TASK_OVERDUE` | Task reminder event riêng; notification digest ổn định theo leader + ngày Việt Nam |

Notification không trả `recipientId` ra client vì session xác định recipient. Nếu task không còn đọc được theo ACL hiện hành, API giữ notification cho recipient nhưng đặt `taskId`/`task` thành `null` và thay title/body bằng nội dung chung.
