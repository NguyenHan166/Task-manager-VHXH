# BE-00-05 — Quyết định vận hành và cổng dữ liệu thật

**Nguồn quyết định:** [D-02–D-11](../PHASE_00_CONTRACT.md). Các mục dưới là hợp đồng cấu hình và checklist cho Phase 01–08; kết quả chạy thật phải được ghi tại task triển khai tương ứng. [Mẫu khóa môi trường](./backend.env.example) không chứa endpoint, bucket, tài khoản hoặc khóa thật.

| Quyết định | Cấu hình/triển khai bắt buộc | Bằng chứng cần lưu tại phase sau |
|---|---|---|
| D-02 | Email công vụ + mật khẩu nội bộ P0; SSO chỉ mở khi đơn vị cung cấp hệ thống/yêu cầu | Kiểm tra login/locked/rate limit Phase 02 |
| D-03 | Access token 8 giờ; refresh cookie 7 ngày, `HttpOnly`, `Secure`, `SameSite=Lax`, xoay vòng; logout một/mọi phiên | Kiểm tra refresh cũ bị từ chối, cookie flag, revoke Phase 02/08 |
| D-04 | Prisma + PostgreSQL; UUID server; counter CV/NH/CN theo năm Việt Nam trong transaction | Migration + tạo đồng thời không trùng mã Phase 01/03 |
| D-05 | `openapi.v1.json` là nguồn chuẩn; envelope, `Page<T>`, 400/401/403/404/409 | Contract check BE/FE Phase 08 |
| D-06 | R2 private; soft REMOVED; object không còn link hợp lệ dọn sau ≥90 ngày hoặc theo lưu giữ dài hơn | R2 ACL, lifecycle, cleanup log Phase 05 |
| D-07 | Notification trong app + Socket.IO P0; email/Zalo tắt | Recipient/dedupe/reconnect Phase 06 |
| D-08 | Backup PostgreSQL mỗi ngày, mã hóa, bucket private riêng, giữ 30 ngày; restore drill hàng tháng; staging dữ liệu giả | Backup log, restore drill, bằng chứng đơn vị cho production Phase 07/08 |
| D-09 | Reopen có lý do, chuyển trạng thái và giữ lịch sử theo [ma trận](./PERMISSIONS.md) | Journey/reopen audit Phase 04 |
| D-10 | Upload tạm gắn TASK; chỉ liên kết SUBMISSION lúc submit; UPLOADING/READY/REMOVED | File state/link/cleanup Phase 05 |
| D-11 | Request gia hạn/đổi chủ trì và màn liên quan mở sau Phase 09 | FE feature gate/nhãn dữ liệu mẫu Phase 08/09 |

## Môi trường

| Môi trường | Dữ liệu và kết nối | Cổng mở |
|---|---|---|
| Local | Dữ liệu giả, DB/R2 dev riêng; secret ở máy người phát triển | Không dùng dữ liệu nghiệp vụ thật |
| Staging | **Chỉ dữ liệu giả**, user/email giả; DB, file bucket và backup bucket tách production | QA Phase 08; xóa hoặc reset dữ liệu giả theo runbook |
| Production | Chỉ nạp dữ liệu nghiệp vụ thật sau cổng D-08 bên dưới | Secret manager, TLS, quyền tối thiểu, backup/restore chứng minh được |

Không commit `.env` chứa giá trị thật. CI và Railway giữ secret; repo chỉ giữ tên khóa trong `backend.env.example`. FE chỉ nhận public API origin do deploy cấp, không nhận DB URI, R2 key, JWT signing key, backup key, signed URL log. Log có request ID/actor ID/action/status nhưng loại bỏ mật khẩu, token, cookie, signed URL, nội dung file và trước/sau nhạy cảm. CORS chỉ cho origin FE xác định. Bucket file và bucket backup đều private; quyền backend vào bucket backup tách quyền upload file thông thường.

Khi MANAGER khóa tài khoản, đổi vai trò hoặc đặt lại mật khẩu, backend thu hồi mọi refresh session của tài khoản trong cùng transaction. Access token cũ bị từ chối ở request kế tiếp bằng kiểm tra trạng thái/phiên hoặc phiên bản quyền hiện hành; không đợi token hết hạn 15 phút mới áp dụng quyền mới.

## Checklist triển khai theo phase

- [ ] Phase 01: validate env bắt buộc và dừng startup khi thiếu; TLS, CORS, security headers, log redaction, health/readiness, graceful shutdown; migration và seed giả có clock cố định.
- [ ] Phase 02: hash mật khẩu và refresh token; rate limit login theo IP/tài khoản; lockout hợp lý; refresh rotation, cookie flags, logout-all; không lộ email có tồn tại.
- [ ] Phase 03–04: ACL role + bản ghi ở query/command; transaction cho task/event/notification; khóa/version chống race; idempotency key cho lệnh nhạy cảm; history append-only.
- [ ] Phase 05: R2 private/CORS tối thiểu, signed URL TTL ngắn, MIME/size/checksum kiểm tra server, READY sau xác minh; gỡ liên kết chặn download mới; cleanup 90 ngày và ngoại lệ lưu lâu hơn.
- [ ] Phase 06: notification lưu trước socket, retry/outbox; scheduler 15 phút trên một instance, unique reminder key, catch-up sau restart; REST bù notification bỏ lỡ.
- [ ] Phase 07: backup hằng ngày, mã hóa và bucket riêng; giữ 30 ngày; restore drill hàng tháng trong môi trường cô lập và đối chiếu user/task/file metadata; alert backup fail, health, cron và KPI latency.
- [ ] Phase 08: FE P0 dùng HTTP thật; route/điều khiển P1 còn mock được gắn nhãn/feature gate; hoàn tất journey MANAGER/DEPUTY/STAFF, file và KPI trước release.

## Cổng D-08 trước khi dùng dữ liệu nghiệp vụ thật trên cloud

Đây là cổng production riêng, **không** được tự động coi là xong chỉ vì Phase 00 đã chốt chính sách. Người chịu trách nhiệm triển khai BE-08-04 lưu một bản ghi có kiểm chứng gồm: tên đơn vị, người có thẩm quyền, ngày chấp thuận, phạm vi dữ liệu được phép đưa lên cloud, nơi lưu bằng chứng, thời hạn/điều kiện chấp thuận. Không đưa nội dung nhạy cảm của văn bản chấp thuận vào repo công khai; chỉ ghi ID/đường dẫn nội bộ do đội quản lý.

Trước khi nạp dữ liệu thật:

1. Xác nhận bằng chứng chấp thuận của đơn vị bao phủ Railway PostgreSQL, Cloudflare R2 và vị trí/lưu lượng backup thực tế; nếu không bao phủ, dừng nạp và xin quyết định mới.
2. Kiểm tra staging chỉ có dữ liệu giả; không clone DB/file production sang staging.
3. Kiểm tra backup đã chạy, mã hóa, restore drill tháng hiện tại thành công, quyền bucket riêng và retention 30 ngày; có phương án khôi phục file R2 cùng metadata DB.
4. Kiểm tra RBAC/ACL, login/refresh/revoke, R2 signed URL, export/audit, nhắc hạn/socket, log redaction trên môi trường production dự kiến.
5. Ghi người xác nhận, thời gian và bằng chứng vào BE-08-04; chỉ sau đó mới chuyển `REAL_DATA_APPROVED=true` trong cấu hình production và thực hiện nạp có kiểm soát.

Nếu chấp thuận bị thu hồi hoặc phạm vi dữ liệu thay đổi, tắt nhập dữ liệu mới, bảo toàn backup/audit và xử lý theo quyết định mới của đơn vị. `REAL_DATA_APPROVED` chỉ là chốt vận hành bổ sung, không thay thế bằng chứng chấp thuận.
