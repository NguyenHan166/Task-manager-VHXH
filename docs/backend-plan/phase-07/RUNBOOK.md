# Phase 07 — Báo cáo và vận hành

## Phạm vi API

- `GET /api/dashboard/stats?scope=DEPT|STAFF`: DEPT chỉ dành cho MANAGER/DEPUTY_MANAGER; STAFF chỉ tổng hợp dữ liệu của người đang đăng nhập. Bộ lọc thời điểm nhận ISO 8601 UTC kết thúc bằng `Z`.
- `GET /api/reports/kpi`, `GET /api/reports/tasks`: dùng cùng bộ lọc KPI và ACL. STAFF chỉ xem dữ liệu có quyền đọc.
- `GET /api/reports/tasks/export?format=CSV|XLSX`: MANAGER/DEPUTY_MANAGER, tối đa 5.000 dòng, chỉ OFFICIAL đã phát hành trong báo cáo toàn phòng.
- `GET /api/settings`: người dùng đã đăng nhập; `PATCH /api/settings`: chỉ MANAGER. Cài đặt reminder và giới hạn file được đọc lại khi chạy nghiệp vụ.
- `GET /api/audit-logs`: chỉ MANAGER, có lọc thời gian/actor/action/entity và phân trang. Bảng audit là append-only; API không có route sửa/xóa.
- `GET /api/backup` và `GET /api/operations/metrics`: chỉ MANAGER; trả trạng thái và số liệu vận hành, không trả backup bytes, object key hay signed URL.

## KPI và quyền dữ liệu

Các dashboard KPI chạy `groupBy`/`count` và SQL aggregate ở PostgreSQL; backend không tải toàn bộ task rồi mới tính số liệu. `OFFICIAL` là loại duy nhất trong KPI toàn phòng. `totalActivePublished` là TODO + IN_PROGRESS + IN_REVIEW + DONE. DRAFT/CANCELLED có số đếm riêng và không vào tổng hợp lệ. Quá hạn là `dueAt < now` với TODO/IN_PROGRESS/IN_REVIEW. Đúng hạn là DONE với `completedAt <= completionDueAtSnapshot`; mẫu số tỷ lệ theo người là tổng DONE của cùng bộ lọc. Cộng tác viên và chủ trì được đếm tách để không đếm task hai lần.

`fromDate`/`toDate` lọc thời điểm tạo task, inclusive; `dueFrom`/`dueTo` lọc hạn, inclusive. Tất cả đều là UTC ISO 8601; cột export thể hiện cả UTC và giờ `Asia/Ho_Chi_Minh`. DEPT không chứa PERSONAL. PERSONAL của STAFF bị ràng buộc theo `createdById` tại câu query.

Đối chiếu fixed-clock fixture bằng `npm run db:check` và `npm run phase07:check`: 7 OFFICIAL hợp lệ, 1 quá hạn, 1/2 DONE đúng hạn. Chỉ `APP_ENV=local` mới nhận `SYSTEM_CLOCK_OVERRIDE`; không bật trong staging/production.

CSV có UTF-8 BOM, mọi trường được quote và chuỗi bắt đầu bằng dấu công thức được ghi thành literal. XLSX được dựng bằng inline strings, không phát sinh cell công thức. Cả hai định dạng ghi tiêu đề tiếng Việt, người xuất, UTC/giờ Việt Nam, bộ lọc và số dòng; giới hạn 5.000 dòng ngăn export chiếm bộ nhớ không giới hạn.

## Settings và audit

Singleton `app_settings` chứa tên workspace, timezone (cố định `Asia/Ho_Chi_Minh`), giờ hạn mặc định, số giờ nhắc trước và giới hạn MB/file. Cập nhật settings khóa hàng singleton trong transaction; audit ghi actor, entity, before/after trong cùng transaction và chỉ tạo event nếu giá trị đổi. `reminders.service.ts`, `files.service.ts` và task due-date services đọc lại giá trị hiện tại.

Audit events hiện được ghi ở login thành công/thất bại, tạo/sửa/khóa user, đổi password, settings, backup và restore drill. Không ghi password/hash, token/cookie, signed URL, object key, checksum, database URL hoặc file bytes vào API audit; khóa nhạy cảm bị lọc khi đọc. API chỉ đọc và migration cài trigger từ chối UPDATE/DELETE.

## Backup, restore và retention

1. Cài PostgreSQL 16 client (`pg_dump`, `pg_restore`, `psql`) cùng runtime backend. Dùng DB role chỉ đọc để dump và DB role riêng chỉ được tạo object ở bucket backup riêng. Nơi lưu backup phải private; tách bucket, khóa và quyền khỏi bucket R2 file.
2. Tạo `BACKUP_ENCRYPTION_KEY` ngẫu nhiên 32 byte, lưu vào secret manager; cấu hình `BACKUP_BUCKET`, `BACKUP_S3_ENDPOINT`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` và `BACKUP_S3_REGION`. Đặt `BACKUP_SCHEDULE_UTC` (mặc định `02:00`) và `BACKUP_RETENTION_DAYS` (tối thiểu 30).
3. Backend mở snapshot PostgreSQL repeatable-read, chạy `pg_dump --format=custom`, mã hóa streaming AES-256-GCM trước khi ghi file/bucket. Metadata chỉ lưu checksum, kích thước, thời điểm, trạng thái và số user/task/file; key giải mã không lưu trong DB. Startup catch-up chạy backup trong ngày nếu lịch đã trôi qua; unique `scheduled_for` và claim trạng thái ngăn lặp giữa instance.
4. Backup hằng ngày tự xóa object có tuổi lớn hơn retention, sau đó đánh dấu bản ghi hết hạn. Backup lỗi tăng metric và phát log `backup_failed`; alert hạ tầng cần báo khi `GET /api/backup` trả `FAILED`, hoặc không có success trong 26 giờ. Báo thêm khi `lastRestoreDrillAt` cũ hơn 32 ngày.
5. Mỗi tháng tạo DB đích rỗng `office_workspace_restore_verify*` trong môi trường cô lập, đặt `RESTORE_DRILL_DATABASE_URL` và chạy `npm run backup:drill -- --confirm`. Restore yêu cầu DB/host tách nguồn (production bắt buộc host riêng), chỉ nạp vào DB rỗng, kiểm tra số hàng `users`, `tasks`, `file_objects`, ghi audit và thời gian drill. Không mở endpoint tải dump cho người dùng.
6. Metadata DB không khôi phục object R2 đã mất. Nếu mất object file, khôi phục metadata và object theo version/lifecycle của R2 riêng; ghi rõ khoảng thời gian mất dữ liệu file trong biên bản sự cố.

Local có thể dùng `BACKUP_LOCAL_DIR` là đường dẫn tuyệt đối khi `APP_ENV=local`; POSIX tạo file mode user-only, Windows kế thừa ACL NTFS của thư mục nên thư mục phải chỉ dành cho tài khoản vận hành. Nếu máy không có PostgreSQL client trên PATH, `PG_CLIENT_DOCKER_CONTAINER` cho phép gọi client trong đúng Postgres container local, và bị từ chối ở staging/production. Cấu hình S3 là mặc định cho staging/production; local path bị từ chối ở hai môi trường đó. CLI backup/restore cần `--confirm` tường minh.

## Observability và ngưỡng xử lý

`GET /api/operations/metrics` yêu cầu MANAGER và trả counter trong bộ nhớ của instance, uptime/RSS/heap, CPU process kể từ snapshot trước, số connection DB và `max_connections`, trung bình/max và p95 KPI trong cửa sổ tối đa 512 truy vấn gần nhất, cùng backup status. Counter gồm request thành công/tổng, HTTP 4xx/5xx, login fail, reminder run/dedup/failure, file lỗi, socket disconnect, KPI latency, backup/restore/retention.

### Đo tải giả trên local và staging

Local: đặt `PHASE07_TARGET_ENV=local`, `PHASE07_API_URL=http://127.0.0.1:3010/api`, `PHASE07_TARGET_HOST=127.0.0.1` và chạy `npm run phase07:measure`. Nếu không đặt `PHASE07_MANAGER_ACCESS_TOKEN`, tool đăng nhập bằng user fixture `u01` và `DEMO_SEED_PASSWORD` trong `.env`; không in token ra kết quả. Local chỉ chấp nhận HTTP loopback.

Để đo trên tập dữ liệu lớn, tạo database local riêng tên `office_workspace_phase07_perf_verify*`, áp dụng migration và seed P0 vào database đó, rồi chạy `npm run phase07:perf-seed -- --tasks=10000` (hoặc `--tasks=50000`). Script chỉ cho phép database loopback có prefix này, tối đa 50.000 task và chỉ xóa các dòng synthetic có code `PERF07-*`; không trỏ `DATABASE_URL` vào DB local đang dùng. Khởi động API bằng cùng `DATABASE_URL` scratch, sau đó đo qua loopback. Dùng database/API riêng cho mỗi lần benchmark.

Staging: trên host có HTTPS tới API staging và token MANAGER staging, đặt `PHASE07_TARGET_ENV=staging`, `PHASE07_API_URL=https://<host>/api`, `PHASE07_TARGET_HOST=<host>` và `PHASE07_MANAGER_ACCESS_TOKEN` trong env local/secret manager; không ghi token vào lệnh shell, file kết quả hoặc log. Tool chỉ chấp nhận HTTPS cho staging.

Cả hai chế độ mặc định gửi 50 GET dashboard với concurrency 20; có thể đặt `PHASE07_SAMPLE_COUNT` 20–50 và `PHASE07_CONCURRENCY` 1–50. Giới hạn 50 request giữ một đợt thử nghiệm dưới API rate limit 60/phút từ một client. Chờ ít nhất 60 giây trước đợt tiếp theo; nếu có response không phải 2xx (ví dụ 429), lệnh trả lỗi và kết quả đó không hợp lệ làm benchmark. Tool chỉ thực hiện GET sau bước login local tùy chọn, từ chối target không khớp và timeout mỗi request sau 15 giây. Lưu JSON stdout; trên staging ghép với cửa sổ Railway service/DB metrics để đối chiếu peak RSS/CPU/connection. Báo cáo có client p50/p95/max, process CPU/RSS, DB connection percent và KPI p95. Số đo local phục vụ tối ưu trước, không thay thế nghiệm thu staging.

Request log giữ `requestId`, actor, route, status và thời lượng; không log query string, auth header, body hoặc signed URL. Task event lưu cùng request ID trong cột `task_events.request_id`; notification và outbox giữ `business_event_id` trỏ về event đó. Vì vậy request log → task event → notification/realtime outbox có thể tra bằng cùng ID, không cần ghi nội dung nghiệp vụ vào log. Các request nền như reminder không có HTTP request ID. Lỗi HTTP 5xx, backup lỗi, reminder lỗi và file lỗi phát log JSON có event và ID nội bộ nhưng không có dữ liệu nhạy cảm.

Tra một request nghiệp vụ trong DB bằng request ID lấy từ response header `x-request-id` hoặc log `http_request`:

```sql
SELECT e.id AS task_event_id, e.kind, e.task_id, e.created_at,
       n.id AS notification_id, n.recipient_id,
       o.id AS outbox_id, o.delivered_at, o.attempts
FROM task_events e
LEFT JOIN notifications n ON n.business_event_id = e.id
LEFT JOIN realtime_outbox o ON o.business_event_id = e.id
WHERE e.request_id = $1
ORDER BY e.created_at, n.id, o.id;
```

Ngưỡng cảnh báo tối thiểu cho nền tảng deploy: readiness fail liên tục 2 phút; backup không có success trong 26 giờ hoặc lần gần nhất FAILED; reminder cron không có run trong 30 phút khi scheduler được bật; 5xx > 5% trong 5 phút; KPI p95 > 1 giây; DB connections > 80% giới hạn; RSS > 80% memory limit. Counter trong bộ nhớ reset khi restart; nối log/counter sang nền tảng metrics của deploy để alert qua nhiều instance.

## Tài nguyên và sự cố

Indexes gồm status/hạn/chủ trì, project/status, index partial cho OFFICIAL report, collaborator accepted, audit action/entity và create time. Trên staging, chạy `EXPLAIN (ANALYZE, BUFFERS)` cho dashboard và báo cáo với dữ liệu giả đại diện, lưu plan và kết nối DB trước khi mở rộng fixture. Export bị giới hạn 5.000 task; backup streaming tránh giữ dump plaintext trong RAM, nhưng PostgreSQL client và connection snapshot vẫn dùng CPU/DB connection trong thời gian dump.

**Chưa đo được RAM/CPU/connection thực tế trên staging trong môi trường local.** Trước khi xác nhận ngân sách Railway khoảng 5 USD, deploy staging giả lập, ghi instance type/region, PostgreSQL plan, peak RSS/CPU/connections, p95 KPI, dung lượng dump và thời gian dump/restore trong biên bản BE-08-04. Không suy diễn số đo staging từ kết quả local.

| Sự cố | Kiểm tra | Khôi phục |
|---|---|---|
| Backup `FAILED` | Safe JSON log theo `backupId`; cấu hình client binary, DB connectivity, bucket/quota/permission và encryption key format. Không in secret/key vào ticket. | Sửa secret/permission hoặc binary; chạy CLI một lần; xác nhận `SUCCEEDED` và backup status. |
| Restore drill fail | Log chỉ có backup ID/reason code; kiểm tra DB đích rỗng/isolated, key hiện tại, pg client version, disk space và metadata counts. | Xóa DB đích verify sau khi lưu log, tạo DB rỗng khác và chạy drill lại. Không trỏ sang DB nguồn. |
| KPI chậm | `/operations/metrics` và DB connections; lấy `EXPLAIN (ANALYZE, BUFFERS)` với fixture staging. | Bổ sung index qua migration có review; giới hạn filter/range và export. |
| Reminder trùng/mất | `reminder_runs_*`, `reminder_deduplicated_runs`, `reminder_failures`, unique reminder key, outbox pending age. | Đảm bảo chỉ scheduler leader chạy; publisher retry outbox idempotently; không xóa notification REST. |
| File upload lỗi | `file_request_failures`, request ID, status R2/size validation. Không ghi signed URL. | Kiểm tra bucket/CORS/key/quota; retry flow từ ticket mới theo Phase 05 runbook. |
