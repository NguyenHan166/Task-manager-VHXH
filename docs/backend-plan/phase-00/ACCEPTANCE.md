# Bằng chứng nghiệm thu Phase 00 — 27/10/2026

Các đầu ra này là **hợp đồng thiết kế**, không phải bằng chứng API/backend đã triển khai. Quyết định D-01–D-11 ở [Phase 00](../PHASE_00_CONTRACT.md) đã được người dùng chốt; cổng chấp thuận **dữ liệu thật** D-08 vẫn nằm ở BE-08-04. Mỗi hàng dưới đối chiếu trực tiếp điều kiện “Hoàn thành khi” của task Phase 00.

| Task | Đầu ra và nguồn đối chiếu | Bằng chứng điều kiện hoàn thành |
|---|---|---|
| BE-00-01 | [SCOPE.md](./SCOPE.md), đặc tả §13, handoff §2, FE `main.tsx`/`AppShell.tsx` | Bảng 27 feature có phase, endpoint, route, owner, trạng thái. Auth/users/OFFICIAL/comment/file/notification/dashboard/report/settings/audit/backup đều P0; project/calendar/TEAM/PERSONAL/request/subtask/recurrence/chat P1; P2 tách backlog. AppShell hiển thị nhãn dữ liệu mẫu cho route và điều khiển P1. |
| BE-00-02 | [PERMISSIONS.md](./PERMISSIONS.md), đặc tả §2/§4/§15, handoff §6.2, Phase 02–04/09, FE `TaskService` | Ma trận 3 role theo loại/status/quan hệ, admin Manager-only, Deputy điều hành OFFICIAL; DRAFT/PERSONAL/TEAM PENDING và đổi chủ trì có policy. Có sơ đồ transition, reason bắt buộc, actor, race/409. |
| BE-00-03 | [API_CONTRACT.md](./API_CONTRACT.md), [OpenAPI v1](./openapi.v1.json), FE `data-contract.ts`, API mapping, handoff §2 | 79 operation với DTO/request/response/errors, ví dụ JSON, danh mục Socket/event. Đã chọn một path cho submit/approve/return, request P1, dashboard, backup. FE `TaskQuery.isOverdue` và `CREATED_AT` được đồng bộ. Script [verify_phase00.py](./verify_phase00.py) kiểm tra operationId/ref/path/envelope; FE build thành công. |
| BE-00-04 | [DATA_MODEL.md](./DATA_MODEL.md), [fixture clock cố định](./kpi-fixture.v1.json), handoff §3–§5/§9.4, FE seed/selectors | ERD, bảng model/unique/index/FK/CHECK, thứ tự migration, UUID/counter nguyên tử, UTC/dueDate/snapshot, ACL file link. Fixture 17 task tại `2026-10-27T09:00:00.000Z`; verifier tính lại chính xác KPI 7 và 11 từ cùng công thức. |
| BE-00-05 | [OPERATIONS.md](./OPERATIONS.md), [backend.env.example](./backend.env.example), D-02–D-11 | Mỗi quyết định gắn cấu hình/bằng chứng phase sau; staging chỉ dữ liệu giả; production có cổng kiểm tra chấp thuận D-08. Mẫu env để trống DB/key/bucket, không ghi địa chỉ hạ tầng thật. |

## Các khác biệt nguồn đã giải quyết

| Nguồn cũ | Quyết định áp dụng | Nơi thể hiện |
|---|---|---|
| PRD §13/§15 nói hai vai trò, FE `TaskService` có guard MANAGER-only | D-01: ba vai trò; Deputy toàn quyền điều hành OFFICIAL, chỉ Manager quản trị hệ thống | [PERMISSIONS.md](./PERMISSIONS.md); FE guard cũ thay khi nối HTTP Phase 08 |
| PRD `/api/tasks/:id/submit`; handoff/API mapping `/submissions` | Một endpoint `POST /api/tasks/{id}/submissions` kể cả kỳ định kỳ | [API_CONTRACT.md](./API_CONTRACT.md), OpenAPI |
| Handoff approve/return thiếu submissionId trong body | Thêm `submissionId` để quyết định đúng lần nộp PENDING hiện hành | OpenAPI `ApprovalInput`/`ReturnInput` |
| PRD `/api/dashboard`; handoff `/api/dashboard/stats` | Dùng `/api/dashboard/stats?scope=DEPT|STAFF` | OpenAPI và [SCOPE.md](./SCOPE.md) |
| Prototype backup JSON export | `GET /api/backup` chỉ trả trạng thái/metadata an toàn; job backup/restore server-side | [API_CONTRACT.md](./API_CONTRACT.md), [OPERATIONS.md](./OPERATIONS.md) |
| Handoff file upload trả `objectKey`, mock `FileObject` chỉ MOCK_LOCAL/READY/REMOVED | Object key chỉ server biết; BE thêm UPLOADING, gắn TASK tạm rồi chuyển SUBMISSION | OpenAPI `UploadTicket`/`FileObject`, [DATA_MODEL.md](./DATA_MODEL.md) |
| FE `TaskService` dùng cast `isOverdue`, handoff thêm CREATED_AT | Bổ sung type và xử lý sort trong FE | `Frontend/src/shared/data-contract.ts`, `task-service.ts`, `TasksPage.tsx` |
| Handoff cho submit từ TODO hoặc IN_PROGRESS; Phase 04 quy định IN_PROGRESS | Chỉ IN_PROGRESS; FE gọi start trước submit | [PERMISSIONS.md](./PERMISSIONS.md), OpenAPI |
| Handoff gia hạn/đổi chủ trì đã có route, nhưng D-11 xếp P1 | Operation giữ trong OpenAPI với `x-release-phase=P1`, UI có nhãn mock | [SCOPE.md](./SCOPE.md), OpenAPI, `AppShell.tsx` |

## Kết quả kiểm tra tại thời điểm nghiệm thu

- Chạy `build_openapi.py` và `build_fixture.py` bằng Python bundled: sinh OpenAPI v1 và fixture có clock cố định.
- Chạy `verify_phase00.py`: **PASS** 79 operationId duy nhất, 85 schema, `$ref`/path param/envelope; **PASS** KPI 7/11; **PASS** nhãn P1 và khóa môi trường trống.
- Chạy `npm run build` trong `Frontend/`: TypeScript và Vite build **thành công**. Cảnh báo chunk >500 kB là giới hạn tối ưu bundle của prototype, không ảnh hưởng hợp đồng Phase 00.
- Quét mẫu URL/secret trong repo: chỉ thấy `postgresql://...@...railway.internal:5432/...` là placeholder có dấu `...` ở đặc tả cũ; mẫu env mới không chứa giá trị thật.

Khi Phase 01–09 triển khai, bằng chứng API/DB/runtime được ghi tiếp tại task tương ứng. Các checkbox Phase 00 xác nhận hợp đồng đã tạo và đối chiếu nguồn, không xác nhận P0/P1 đã chạy trên backend thật.
