# Bằng chứng Phase 01 — 27/10/2026

Đối chiếu với [PHASE_01_FOUNDATION.md](../PHASE_01_FOUNDATION.md). Môi trường kiểm tra: Windows, Node 24, Docker Desktop, `postgres:16` local trên `127.0.0.1:5433`. Dữ liệu sử dụng là fixture giả, không có dữ liệu nghiệp vụ thật.

| Task | Bằng chứng tại repo và runtime | Kết quả |
|---|---|---|
| BE-01-01 | `Server/src`, `Server/package-lock.json`, `Server/README.md`; `npm run build`; `GET /api/health` | Build thành công; trả `{"data":{"status":"ok","database":"ok"}}` khi DB healthy. |
| BE-01-02 | `Server/.env.example`, `src/config/validate-env.ts`, `src/common/http`, `src/main.ts`; chạy app với signing key ngắn | Startup exit 1 và báo đúng khóa cấu hình sai. Health có request ID, CORS chỉ trả origin FE, Helmet có `X-Content-Type-Options: nosniff`; request log JSON không ghi body/query/token. |
| BE-01-03 | `prisma/schema.prisma` và migration `20261027114322_phase01_foundation`; DB tạm rỗng `office_workspace_phase01_verify` | `prisma migrate deploy` thành công từ DB rỗng; lần thứ hai không có migration chờ; `migrate status` báo up to date. DB tạm đã xóa, DB dev chính giữ nguyên. |
| BE-01-04 | `prisma/seed.ts`, fixture Phase 00 và `scripts/check-seed.ts` | Seed lần hai giữ nguyên 6 users, 2 projects, 13 tasks, 6 participants, 4 submissions, 3 approvals, 2 file metadata/link. KPI OFFICIAL: tổng 9, hợp lệ 7, TODO 2, IN_PROGRESS 2, IN_REVIEW 1, DONE 2, quá hạn 1, đúng hạn 1. |
| BE-01-05 | `.github/workflows/backend.yml`; `npm ci`, local `format:check`, `lint`, `typecheck`, `build`, migrate/seed/check/health; [GitHub Actions run 40506260134](https://github.com/NguyenHan166/Task-manager-VHXH/actions/runs/40506260134) | Workflow trên nhánh `codex/phase-01-foundation` hoàn tất với kết quả `success`; local cài sạch từ lockfile và các cổng tương đương cũng qua. |

Prisma Studio trả HTTP 200 với tiêu đề `Prisma Studio` tại `http://localhost:5555`, dùng `DATABASE_URL` local từ `.env` và truy cập các bảng đã seed. Container `office-workspace-local-postgres-1` ở trạng thái `healthy`; volume `office-workspace-local_postgres_data` giữ dữ liệu qua `docker compose down`.
