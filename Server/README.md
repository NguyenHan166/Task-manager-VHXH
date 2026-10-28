# Office Workspace backend — Phase 03

NestJS + Prisma + PostgreSQL backend for the single-room Office Workspace application. Phase 01–03 provide the database, demo data, auth/users, and task core APIs. The contract is in [`docs/backend-plan/phase-00`](../docs/backend-plan/phase-00/); see the [Phase 03 acceptance matrix](../docs/backend-plan/phase-03/ACCEPTANCE.md).

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
| `npm run db:clean -- --confirm` | **Delete all data in the local DB** and reapply migrations; seed again afterward |
| `npm run typecheck`, `lint`, `format:check`, `build` | Local quality gates |

The seed uses the fixed clock `2026-10-27T09:00:00.000Z` and the `u01`–`u06`, `t01`–`t13` fixture. It excludes `t14`–`t17` and recurrence/chat tables until Phase 09. It writes two **metadata-only** sample file rows; no binary files exist on R2 yet. R2 upload/download is Phase 05.

The DB URL in `.env` is local only. For another PostgreSQL server, change `DATABASE_URL` and configure environment variables in `.env.example`; do not commit `.env`. Local/staging demo seed refuses `APP_ENV=production`. `db:clean` refuses non-local databases and requires `--confirm`.

## Task API (Phase 03)

`GET /api/tasks` supports `scope`, `type`, `status`, `priority`, `projectId`, `primaryAssigneeId`, `search`, `dueFrom`, `dueTo`, `isOverdue`, `sortBy`, `sortDirection`, `page`, and `pageSize` (1–100). Example: `/api/tasks?scope=OWNED&status=IN_PROGRESS&sortBy=DUE_AT&sortDirection=ASC&page=1&pageSize=10`. ACL is applied before filtering and counting. `GET /api/tasks/:id` returns the task, participants, ready files, latest submission, and history counts; comments and events have separate paginated endpoints.

`POST /api/tasks` creates an OFFICIAL DRAFT for MANAGER/DEPUTY_MANAGER. Only its creator can read it until Phase 04 publish. `PATCH /api/tasks/:id` edits permitted metadata; `POST /api/tasks/:id/comments` accepts 1–4000 characters on active published OFFICIAL tasks. TEAM/PERSONAL creation, project/parent links, and their write flows open in Phase 09. Phase 04 owns publish, status changes, deadline/assignee adjustments, submissions, and approvals.

## Code layout

| Location | Responsibility |
|---|---|
| `src/main.ts`, `src/app.module.ts` | HTTP bootstrap, global middleware/filters, module wiring |
| `src/config` | Environment validation before startup |
| `src/common/http` | Request ID, JSON envelope, error shape and safe structured request logs |
| `src/database` | Prisma lifecycle and atomic business-code allocation |
| `src/health` | Liveness/readiness and `/api/health` contract |
| `src/modules/{auth,users,tasks}` | Auth, users and task core APIs with role and record ACL |
| `src/modules/{files,notifications,reminders,dashboard,reports,settings,audit}` | Reserved feature boundaries for later phases |
| `prisma/schema.prisma`, `prisma/migrations` | Data model and ordered PostgreSQL migration |
| `prisma/seed.ts`, `scripts/check-seed.ts` | Fixed-clock fake fixture and DB comparison |

Task list/detail/comment/event reads use the shared task policy in database queries. Later modules must reuse that policy when exposing related records.

## Migration review

The actual Phase 01 tables and constraints are in [`SCHEMA.md`](./SCHEMA.md). For every new migration, review data compatibility, backfill/defaults, index/lock impact, and how to restore a DB backup. Run it on an empty DB and on a copy of the prior schema before merging. Production migrations use `prisma migrate deploy`, never `db push`; rollback of destructive changes uses a verified backup/restore plan. The CI workflow runs install, format, lint, typecheck, build, fresh migration, repeated seed/KPI check and health readiness.
