# Office Workspace backend — Phase 01

NestJS + Prisma + PostgreSQL foundation for the single-room Office Workspace application. Phase 01 provides the database, demo data, health API, runtime safeguards, and module boundaries. Business endpoints start in Phase 02. The contract is in [`docs/backend-plan/phase-00`](../docs/backend-plan/phase-00/) and the phase checklist is [`PHASE_01_FOUNDATION.md`](../docs/backend-plan/PHASE_01_FOUNDATION.md).

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
| `npm run db:studio` | Browse local DB at `http://localhost:5555` |
| `npm run db:clean -- --confirm` | **Delete all data in the local DB** and reapply migrations; seed again afterward |
| `npm run typecheck`, `lint`, `format:check`, `build` | Local quality gates |

The seed uses the fixed clock `2026-10-27T09:00:00.000Z` and the `u01`–`u06`, `t01`–`t13` fixture. It excludes `t14`–`t17` and recurrence/chat tables until Phase 09. It writes two **metadata-only** sample file rows; no binary files exist on R2 yet. R2 upload/download is Phase 05.

The DB URL in `.env` is local only. For another PostgreSQL server, change `DATABASE_URL` and configure environment variables in `.env.example`; do not commit `.env`. Local/staging demo seed refuses `APP_ENV=production`. `db:clean` refuses non-local databases and requires `--confirm`.

## Code layout

| Location | Responsibility |
|---|---|
| `src/main.ts`, `src/app.module.ts` | HTTP bootstrap, global middleware/filters, module wiring |
| `src/config` | Environment validation before startup |
| `src/common/http` | Request ID, JSON envelope, error shape and safe structured request logs |
| `src/database` | Prisma lifecycle and atomic business-code allocation |
| `src/health` | Liveness/readiness and `/api/health` contract |
| `src/modules/{auth,users,tasks,files,notifications,reminders,dashboard,reports,settings,audit}` | Feature boundaries, currently empty until their planned phases |
| `prisma/schema.prisma`, `prisma/migrations` | Data model and ordered PostgreSQL migration |
| `prisma/seed.ts`, `scripts/check-seed.ts` | Fixed-clock fake fixture and DB comparison |

Controllers will call application services, which use repositories/Prisma and shared policy checks. ACL must be enforced in queries/commands; the empty feature modules deliberately expose no business routes before those checks exist.

## Migration review

The actual Phase 01 tables and constraints are in [`SCHEMA.md`](./SCHEMA.md). For every new migration, review data compatibility, backfill/defaults, index/lock impact, and how to restore a DB backup. Run it on an empty DB and on a copy of the prior schema before merging. Production migrations use `prisma migrate deploy`, never `db push`; rollback of destructive changes uses a verified backup/restore plan. The CI workflow runs install, format, lint, typecheck, build, fresh migration, repeated seed/KPI check and health readiness.
