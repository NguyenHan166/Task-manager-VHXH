# Office Workspace backend — Phase 07

NestJS + Prisma + PostgreSQL backend for the single-room Office Workspace application. Phase 01–07 provide the database, demo data, auth/users, OFFICIAL workflow, private R2 file lifecycle, notifications, dashboard/reports, settings, audit and encrypted backup operations. The API contract is in [`docs/backend-plan/phase-00`](../docs/backend-plan/phase-00/); see the [Phase 03 task matrix](../docs/backend-plan/phase-03/ACCEPTANCE.md), [Phase 04 workflow record](../docs/backend-plan/phase-04/ACCEPTANCE.md), [Phase 05 file runbook](../docs/backend-plan/phase-05/RUNBOOK.md), and [Phase 07 operations runbook](../docs/backend-plan/phase-07/RUNBOOK.md).

## Local setup (Windows PowerShell)

Requirements: Node.js 22.12+ and Docker Desktop running with the local `postgres:16` image. Run these commands from `Server/`:

```powershell
npm ci
npm run db:init
npm run db:up
npm run db:migrate
npm run db:generate
npm run db:seed
npm run db:check
npm run dev
```

`db:init` creates an ignored `.env` with random local PostgreSQL password, signing key and demo password. It leaves an existing `.env` unchanged. Docker Compose uses only the local `postgres:16` image, persists data in `office-workspace-local_postgres_data`, and binds PostgreSQL to **127.0.0.1:5433**. The API port comes from `PORT` (default `3000`); readiness is `http://localhost:<PORT>/api/health/ready`.

To inspect or edit local records in a browser, open a second terminal in `Server/`:

```powershell
npm run db:studio
```

Open **http://localhost:5556**. Prisma Studio shows `users`, `tasks`, submissions, approvals and every other table. The database credentials are already read from `.env`; no separate UI image or account is needed. The demo login password is stored as `DEMO_SEED_PASSWORD` in your ignored local `.env`.

## Everyday commands

| Command | Purpose |
|---|---|
| `npm run db:up` | Start/ensure PostgreSQL container is healthy |
| `npm run db:down` | Stop container; keep named volume and data |
| `npm run db:migrate` | Apply committed migrations to an existing DB |
| `npm run db:dev` | Create a migration while developing the schema |
| `npm run db:status` | Show migration status |
| `npm run db:seed` | Idempotently load fake P0 users/tasks/relations |
| `npm run db:check` | Compare row counts and KPI against Phase 00 fixture |
| `npm run db:studio` | Browse local DB at `http://localhost:5556` |
| `npm run auth:check` | Run the localhost-only Phase 02 HTTP security matrix against a seeded disposable DB |
| `npm run tasks:check` | Run the localhost-only Phase 03 task matrix against a seeded disposable DB |
| `npm run workflow:check` | Run the Phase 04 OFFICIAL workflow matrix against a seeded disposable DB named `office_workspace_phase04_verify*` (CI uses an isolated service DB) |
| `npm run files:cleanup` | Mark expired uploads removed and purge due unlinked objects in a bounded batch |
| `npm run files:check` | Run the Phase 05 HTTP/storage matrix against a seeded disposable DB using local S3 test storage |
| `npm run files:check -- --r2` | Run the same matrix against the configured private R2 bucket and verify its CORS response |
| `npm run phase07:check` | Run Phase 07 dashboard, report/export, settings, audit and permissions acceptance against a seeded disposable DB named `office_workspace_phase07_verify*` |
| `npm run phase07:perf-seed -- --tasks=10000` | Add at most 50,000 synthetic OFFICIAL tasks to a separate localhost DB named `office_workspace_phase07_perf_verify*` for Phase 07 load measurements; deletes/replaces only `PERF07-*` rows |
| `npm run backup:run -- --confirm` | Create one encrypted backup using the configured private S3 bucket, or an explicit local-only path |
| `npm run backup:drill -- --confirm` | Restore the latest retained backup into an empty isolated `office_workspace_restore_verify*` database and compare metadata counts |
| `npm run db:clean -- --confirm` | **Delete all data in the local DB** and reapply migrations; seed again afterward |
| `npm run typecheck`, `lint`, `format:check`, `build` | Local quality gates |

The seed uses the fixed clock `2026-10-27T09:00:00.000Z` and the `u01`–`u06`, `t01`–`t13` fixture. It excludes `t14`–`t17` and recurrence/chat tables until Phase 09. It does not seed fake READY file metadata: a file becomes READY only after R2 confirms the object and the server verifies its bytes. See the [Phase 05 runbook](../docs/backend-plan/phase-05/RUNBOOK.md) before configuring a private bucket.

Phase 07 uses database-side aggregation for dashboard and report KPIs. Managers and deputy managers can export department reports; department report rows are published OFFICIAL tasks only. Settings and audit writes/reads, backup metadata and operations metrics require MANAGER. `SYSTEM_CLOCK_OVERRIDE` is accepted only with `APP_ENV=local`, for fixed-clock acceptance runs.

Encrypted PostgreSQL backup uses `pg_dump`, `pg_restore` and `psql` client binaries. Outside local, configure a dedicated private `BACKUP_BUCKET`, separate credentials/endpoint, and a 32-byte hex `BACKUP_ENCRYPTION_KEY`; never reuse the R2 file bucket or commit the key. Set a separate database URL for `RESTORE_DRILL_DATABASE_URL`, on a distinct host in production. Local acceptance may use an absolute `BACKUP_LOCAL_DIR` and `PG_CLIENT_DOCKER_CONTAINER` (for a local Postgres container without host client binaries) only with `APP_ENV=local`. See the [operations runbook](../docs/backend-plan/phase-07/RUNBOOK.md) for retention, restore drills, alerts and resource measurements.

The DB URL in `.env` is local only. For another PostgreSQL server, change `DATABASE_URL` and configure environment variables in `.env.example`; do not commit `.env`. Local/staging demo seed refuses `APP_ENV=production`. `db:clean` refuses non-local databases and requires `--confirm`.

## Task API (Phase 03)

`GET /api/tasks` supports `scope`, `type`, `status`, `priority`, `projectId`, `primaryAssigneeId`, `search`, `dueFrom`, `dueTo`, `isOverdue`, `sortBy`, `sortDirection`, `page`, and `pageSize` (1–100). Example: `/api/tasks?scope=OWNED&status=IN_PROGRESS&sortBy=DUE_AT&sortDirection=ASC&page=1&pageSize=10`. ACL is applied before filtering and counting. `GET /api/tasks/:id` returns the task, participants, ready files, latest submission, and history counts; comments and events have separate paginated endpoints.

`POST /api/tasks` creates an OFFICIAL DRAFT for MANAGER/DEPUTY_MANAGER. Only its creator can read it until publish. The workflow supports publish, start, progress/blocked state, submission/withdrawal, approval/return, direct adjustment, cancel, and reopen. Each state change and notification is written in the same transaction; version checks make a replay or concurrent decision return `409` without duplicate history. Published deadline and assignee changes use `/adjust`, never generic `PATCH`. TEAM/PERSONAL creation, project/parent links, and their write flows open in Phase 09.

## Code layout

| Location | Responsibility |
|---|---|
| `src/main.ts`, `src/app.module.ts` | HTTP bootstrap, global middleware/filters, module wiring |
| `src/config` | Environment validation before startup |
| `src/common/http` | Request ID, JSON envelope, error shape and safe structured request logs |
| `src/database` | Prisma lifecycle and atomic business-code allocation |
| `src/health` | Liveness/readiness and `/api/health` contract |
| `src/modules/{auth,users,tasks}` | Auth, users, task core APIs, and transactional OFFICIAL workflow commands |
| `src/modules/files` | Signed R2 uploads/downloads, metadata, ACL, removal and cleanup |
| `src/modules/{notifications,reminders,dashboard,reports,settings,audit,operations,observability}` | Notifications, DB-side reporting, admin settings/audit, encrypted backups and runtime metrics |
| `prisma/schema.prisma`, `prisma/migrations` | Data model and ordered PostgreSQL migration |
| `prisma/seed.ts`, `scripts/check-seed.ts`, `scripts/check-workflow.ts`, `scripts/check-phase07.ts` | Fixed-clock fake fixture, DB comparison, OFFICIAL journey and Phase 07 acceptance |

Task list/detail/comment/event reads use the shared task policy in database queries. Later modules must reuse that policy when exposing related records.

## Migration review

The actual Phase 01 tables and constraints are in [`SCHEMA.md`](./SCHEMA.md). For every new migration, review data compatibility, backfill/defaults, index/lock impact, and how to restore a DB backup. Run it on an empty DB and on a copy of the prior schema before merging. Production migrations use `prisma migrate deploy`, never `db push`; rollback of destructive changes uses a verified backup/restore plan. The CI workflow runs install, format, lint, typecheck, build, fresh migration, repeated seed/KPI check and health readiness.
