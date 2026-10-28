# Phase 07 — Bằng chứng nghiệm thu

## Phạm vi đã triển khai

| Hạng mục | Bằng chứng |
|---|---|
| Dashboard/KPI theo vai trò và filter | `Server/src/modules/dashboard`; DB-side `groupBy`/aggregate; fixed-clock 7/1/1-of-2 được kiểm qua `scripts/check-phase07.ts`. |
| Reports/CSV/XLSX | `Server/src/modules/reports`; department export lãnh đạo-only, giới hạn 5.000 dòng, UTF-8 BOM/inline strings, kiểm tra injection trong script nghiệm thu. |
| Settings/audit | `Server/src/modules/settings` và `Server/src/modules/audit`; manager-only PATCH/audit, transaction before/after và trigger append-only. |
| Backup/restore | `Server/src/modules/operations`; daily encrypted custom-format dump, private S3/local-only path, 30-day retention, isolated restore check. |
| Metrics/log | `Server/src/modules/observability`; request/error/login/reminder/file/socket/KPI/backup counters, KPI p95 trên cửa sổ 512 mẫu và manager-only operations endpoint. Request ID được lưu ở task event để nối notification/outbox qua `business_event_id`. |

## Lệnh nghiệm thu local

Chỉ chạy trên DB rỗng có tên bắt đầu bằng `office_workspace_phase07_verify`. `phase07:check` từ chối DB mặc định để tránh sửa dữ liệu đang dùng. Dùng seed giả cố định và bật clock override chỉ trong tiến trình acceptance:

```powershell
npm run db:migrate
npm run db:generate
npm run db:seed
npm run db:check
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run phase07:check
```

Script khởi động `dist/main.js` trên cổng loopback tạm, gọi API thật, khôi phục settings về giá trị cũ, rồi dừng tiến trình. Các bản ghi auth/audit phát sinh chỉ thuộc database verify.

## Kết quả lần chạy

- Source/type/lint/format/build: **PASS** tại thời điểm ghi nhận.
- Migration Phase 07 + seed local Phase 6/7: **PASS** trên DB local.
- Runtime acceptance disposable DB `office_workspace_phase07_verify_20261028_e96ba98f`: **PASS, 70 assertions** sau khi áp dụng đủ 6 migrations và seed fixture. Bao gồm KPI fixed-clock 7/1/1-of-2, filters, STAFF/leader scope, CSV/XLSX và KPI denominator tính đúng tập dòng xuất, formula injection, export permission, settings/audit permission, redaction và audit append-only; đồng thời xác nhận response echo `x-request-id`, task event lưu ID, notification nối về event, KPI p95 bounded-window với nearest-rank đúng và giới hạn 512 mẫu, process CPU sample cùng database connection limit. DB scratch đã được xóa sau nghiệm thu.
- Backup/restore local drill: **PASS** với encrypted custom dump qua PostgreSQL 16 client trong Docker và storage local-only. Disposable test kiểm tra dedupe/retention; backup mới sau migration correlation được restore sang DB cô lập, giữ cột `task_events.request_id` và khớp `users=6`, `tasks=13`, `fileObjects=2`. DB restore đã xóa sau kiểm tra. Local-only drill không thay thế kiểm tra quyền/retention của bucket S3 staging.
- Operational snapshot **local-only**, không phải số đo staging: lúc `2026-10-28T12:44:56Z`, sau 20 truy vấn dashboard trên fixture local, RSS `112,103,424` bytes, heap `41,546,240` bytes, CPU `1.11%` một core trên cửa sổ `87.42 s`, 2/100 DB connections và KPI p95 `4 ms` (`n=20`, cửa sổ capacity 512). CPU window gồm cả thời gian idle giữa các snapshot; không dùng số này suy ra tải staging.
- Load benchmark **local-only** trên DB scratch với 50.000 task OFFICIAL tổng hợp + 9 task OFFICIAL fixture: lúc `2026-10-28T13:11:20Z`, 50 GET dashboard, concurrency 20, **50/50 HTTP 200**; client p50/p95/max `71/110/128 ms`; server KPI avg/max/p95 `50/78/74 ms` (`n=50`); RSS `175,669,248` bytes, heap `57,758,136` bytes, 20/100 DB connections. CPU sample `166%` một core trong `245 ms`, là cửa sổ ngắn ngay sau khi khởi động API nên không đại diện tải duy trì. Với buffer cache nóng, `EXPLAIN (ANALYZE, BUFFERS)` cho group-by trạng thái mất `4.74 ms` qua index-only scan, đếm hoàn tất đúng hạn `7.00 ms`, đếm quá hạn `1.07 ms`; các truy vấn dùng index hiện có `tasks_type_status_due_at_idx`. Chưa thấy KPI vượt ngưỡng 1 giây hay lý do thêm index từ profile local này. DB scratch đã được xóa sau đo; số liệu này không thay thế staging.
- Staging RAM/CPU/connection, KPI latency và Railway cost objective: **chưa đo**; local acceptance không thay thế số đo staging. Ghi số liệu staging giả và xác nhận alert ở BE-08-04.
