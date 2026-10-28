# BE-06 — Nghiệm thu thông báo, nhắc hạn và realtime

## API và cursor

- `GET /api/notifications?limit=50&unreadOnly=false` trả tối đa 100 mục, mới nhất trước.
- `after=<cursor>` trả các mục có `(createdAt,id)` lớn hơn cursor theo thứ tự tăng dần để phát lại sau reconnect. `before=<cursor>` lấy trang cũ hơn. Hai cursor không dùng cùng lúc.
- Response gồm `items`, `unreadCount`, `hasMore`, `latestCursor`, `nextCursor`. FE lưu `latestCursor` và coi `notification:new` là tín hiệu để refetch REST. `nextCursor` đi theo hướng phân trang hiện tại.
- `GET /api/notifications/unread-count`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all`. Read-one chỉ cập nhật hàng có `recipientId` bằng user hiện tại; ngoài recipient trả 404.

## Giao nhận realtime

- Socket.IO namespace `/realtime`; access token đi trong `auth.token` hoặc Bearer header.
- Handshake và từng lần join xác minh JWT, session DB, trạng thái user. User room được server join tự động là `user_{id}`. Client không có API join user room.
- `room:join { taskId }` chỉ vào `task_{id}` nếu ACL cho phép. Publisher kiểm tra lại session và ACL trước mỗi `task:updated`; phiên khóa/thu hồi/hết hạn bị ngắt ở lần xử lý kế tiếp hoặc watchdog 30 giây.
- Workflow ghi `TaskEvent`, `Notification` và outbox trong cùng transaction. Mỗi event Task có một outbox `TASK_UPDATED`; mỗi notification có một outbox `NOTIFICATION_NEW`. Publisher claim bằng `FOR UPDATE SKIP LOCKED`, retry lỗi với backoff đến 15 phút. Outbox đã phát nhưng mất ACK có thể phát lại; `eventId` ổn định giúp client khử trùng.
- Socket chỉ gửi `eventId`, `occurredAt`, `entityId`, và `version` với task. Nội dung notification luôn đọc từ REST.

## Nhắc hạn

- `@nestjs/schedule` được khởi tạo ở app; reminder interval đọc `REMINDER_INTERVAL_MINUTES`, mặc định 15 phút. Worker chạy ngay sau bootstrap để catch-up.
- Due-soon dùng `REMINDER_BEFORE_HOURS` (mặc định 24); mốc đến hạn chỉ trong ngày hạn Việt Nam. Reminder quá hạn chạy 09:00–18:00 giờ Việt Nam, một lần mỗi task/người/ngày; lãnh đạo nhận một digest OFFICIAL/ngày.
- `DRAFT`, `DONE`, `CANCELLED` bị loại; `IN_REVIEW` vẫn được nhắc. Milestone dùng `dueAt` hiện hành nên hạn cũ không tiếp tục sinh reminder sau khi task được điều chỉnh.
- `reminder_events` unique `(taskId, recipientId, reminderType, milestoneKey)`; insert milestone, notification và outbox cùng transaction. Nếu server dừng nhiều ngày, lần chạy tiếp theo chỉ gửi mốc của ngày hiện tại, không bắn lại toàn bộ ngày đã lỡ.

## Nghiệm thu chạy được

Chỉ chạy trên database PostgreSQL local dùng riêng có tên `office_workspace_phase06_verify*` (CI được phép dùng database của job). Script từ chối database không local hoặc database dev bình thường.

1. Build và migrate: `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`.
2. Khởi động API trên localhost rồi chạy `npm run notifications:check`.
3. Script kiểm tra recipient API, comment, cursor reconnect, read-one/read-all, nội dung được làm chung khi ACL mất, Socket.IO handshake/room, outbox delivery, notification offline, user LOCKED, reminder trước hạn/đến hạn/quá hạn, `IN_REVIEW`, loại trừ DRAFT/DONE/CANCELLED và chạy job lần hai không sinh trùng.
4. Để kiểm tra restart: chạy `npm run notifications:check -- --prepare-restart`, khởi động lại server, sau đó chạy `PHASE06_RESTART_KEY=<key-vừa-in> npm run notifications:check -- --verify-restart`. Backend CI chạy cả chu trình này.
5. `npm run workflow:check` nghiệm thu publish, submit, withdraw, approve, return, adjust, recipient matrix và rollback; Phase 06 còn kiểm tra outbox không thoát transaction khi notification insert bị lỗi.

## Kết quả môi trường hiện tại

| Nhóm | Kết quả |
|---|---|
| API/recipient ACL/cursor | PASS — `notifications:check`, 2026-10-28 |
| Outbox/socket/room/session | PASS — publish/retry, room ACL, locked-user handshake và offline recovery, 2026-10-28 |
| Reminder VN/dedupe/trạng thái | PASS — due-soon, due, overdue, `IN_REVIEW`, loại trừ trạng thái cuối và chạy lặp, 2026-10-28 |
| Server restart | PASS — pending outbox và notification được giao/đọc sau restart, 2026-10-28 |
| Workflow rollback + recipient matrix | PASS — `workflow:check`, gồm kiểm tra notification/outbox rollback, 2026-10-28 |

Lint, typecheck, format check và build đều PASS; Prisma báo schema scratch database đã up to date. `prisma generate` không thể thay native engine DLL trong lượt cuối vì tiến trình dev hiện có đang giữ file; Prisma Client Phase 6 đã được sinh trước đó và typecheck, build, migration cùng runtime acceptance đều chạy thành công.
