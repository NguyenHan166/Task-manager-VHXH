# BE-04 — Workflow OFFICIAL

**Implementation:** BE-04-01 through BE-04-05 are implemented in `Server/src/modules/tasks/tasks-workflow.service.ts` and exposed by `tasks.controller.ts`. The repeatable runtime journey is `Server/scripts/check-workflow.ts`, registered as `npm run workflow:check` and in backend CI.

**Runtime status:** Passed on 2026-10-28 against a fresh PostgreSQL 16 disposable database named `office_workspace_phase04_verify` on localhost port 15434. Both migrations were applied, the P0 fixture was seeded, and `npm run workflow:check` passed against the built API. The temporary database was isolated from the existing development databases.

## Implemented behavior

| Task | Implementation evidence | Runtime acceptance |
|---|---|---|
| BE-04-01 | `POST /publish`, `/start`, `/progress`; DRAFT validation; leader/current-assignee ACL; progress 0–100; blocked reason validation; task event and notification writes share the transaction. | Passed `workflow:check` |
| BE-04-02 | Submission history list/create/withdraw; READY task file links move to the new submission; withdraw only applies to the current PENDING submission by its submitter; retry returns `409`. | Passed `workflow:check` |
| BE-04-03 | Approval history list; MANAGER/DEPUTY_MANAGER approve/return the current PENDING submission; approval stores the current due-date snapshot; submission, approval, task, event, and notification commit together. | Passed `workflow:check` |
| BE-04-04 | `/adjust`, `/cancel`, `/reopen`; required nonblank reason; assignee status and ACL recalculate at command time; cancellation closes a pending submission; D-09 reopen behavior retains history and clears current completion fields. A cancelled OFFICIAL draft may remain without publish details. | Passed `workflow:check` |
| BE-04-05 | Optimistic `Task.version` and current-status conditions protect every workflow mutation. A failed condition returns `409`; task writes, history, file links, and notifications are in one Prisma transaction. Replayed transitions return `409`; same-value progress/adjust commands return the current task without duplicate history. | Passed concurrency and injected rollback checks in `workflow:check` |
| BE-04-06 | HTTP/DB scenario matrix covers role and record ACL, duplicate publish/submit, same-value progress, withdrawal race, two leaders deciding concurrently, return/resubmit, file rejection, owner change, cancellation/reopen, event history, and notification recipients. | Passed runtime matrix |

## Phase 04 notification recipients

- Publish: current primary assignee (`TASK_ASSIGNED`).
- New blocker, submission, and withdrawal: active leaders other than the actor (`TASK_UPDATED`, `SUBMISSION_RECEIVED`, `SUBMISSION_WITHDRAWN`).
- Approve/return: submission author and current primary assignee, excluding the actor (`SUBMISSION_APPROVED`/`SUBMISSION_RETURNED`).
- Adjustment: new assignee and previous assignee when reassigned; otherwise current assignee (`TASK_ASSIGNED`/`TASK_UPDATED`).
- Cancel/reopen: current assignee; cancellation from `IN_REVIEW` also notifies the submitter (`TASK_UPDATED`).

Inactive users and the actor are filtered out. Notification rows use the `TaskEvent` ID as `businessEventId`, with the DB uniqueness key `(businessEventId, recipientId)`. Socket delivery and reconnect handling remain in Phase 06.

## Running the matrix

Use a seeded disposable database whose name starts with `office_workspace_phase04_verify`, and point both the API and `DATABASE_URL` to that database. Run the API on localhost, then run `npm run workflow:check` from `Server/`. The script refuses a non-local database and refuses the normal `office_workspace` database outside CI. It creates test tasks and should only run on a disposable database.

Backend CI starts an isolated PostgreSQL 16 service, applies the migration, seeds the fixture, then runs `npm run workflow:check` after the Phase 03 task matrix.

## Static checks recorded in this workspace

`npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run build`, and the disposable HTTP/DB workflow matrix passed.
