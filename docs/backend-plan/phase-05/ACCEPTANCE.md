# BE-05 — R2 file lifecycle

## Runtime status

BE-05-01 through BE-05-05 are implemented and accepted on 2026-10-28. The repeatable checker is `Server/scripts/check-files.ts`; it exercises the HTTP API against a disposable seeded database and a local S3-compatible server by default. `npm run files:check -- --r2` runs the same API journey against the configured private R2 bucket and checks bucket CORS and anonymous-read denial.

**Local runtime:** `npm run files:check` passed on 2026-10-28 against the disposable PostgreSQL 16 database `office_workspace_phase05_verify` and the in-process S3-compatible server: 74 checks passed, with six test objects cleaned up.

**Live R2 runtime:** `npm run files:check -- --r2` passed on 2026-10-28 against the configured Cloudflare R2 bucket and the disposable PostgreSQL 16 database: 80 checks passed and six temporary objects were cleaned up. The live matrix verified the exact local origin, PUT/GET methods, upload headers, exposed GET headers, signed writes and downloads, anonymous-read denial through both tested URLs, and cleanup. The storage-outage response is exercised with the local S3-compatible server; a live outage is not injected into the configured bucket. Operations and privacy settings are documented in [`RUNBOOK.md`](./RUNBOOK.md).

## Acceptance matrix

| Scenario | Expected evidence | Result |
|---|---|---|
| Valid PNG upload, complete twice, list, signed download | One READY row, persisted SHA-256, idempotent complete, exact bytes downloaded | PASS — local and live R2 |
| Upload staging and task submission | Active link moves TASK → SUBMISSION; task staging link is removed | PASS — local and live R2 |
| Comment attachment | Comment author can upload; entity ACL is enforced on list/download | PASS — local and live R2 |
| Foreign task, 20 MB + 1 byte, blocked MIME | No upload URL or metadata is created | PASS — local and live R2 |
| Declared MIME differs from stored bytes | Complete rejects, marks REMOVED, and deletes the object | PASS — local and live R2 |
| Missing/interrupted/expired upload and storage failure | Complete never reports READY; unavailable storage returns an error | PASS — lifecycle checks local and live; outage injection local only |
| Replayed presigned PUT | Conditional write prevents replacement of the first object | PASS — local and live R2 |
| Removed file and retention | New download URL returns 404; retention is at least 90 days; cleanup will not remove a linked object | PASS — local and live R2 |
| Cleanup | Expired UPLOADING records become REMOVED; due unlinked objects are deleted in bounded batches and logged | PASS — local and live R2 |
| Live private R2 and browser CORS | Signed PUT/GET work; exact frontend origin is allowed; anonymous read is denied | PASS — live R2, 80 checks |

## Security and data invariants

- R2 credentials stay in backend configuration. Public DTOs never contain `objectKey` or signed URLs except for the short-lived URL explicitly returned by the ticket endpoints.
- Only READY files with an active link and current task access can be listed or receive a new download URL. ACL filtering occurs before pagination and counting.
- Every READY transition is conditional on the uploader, active UPLOADING state, unexpired ticket, declared size, actual object size and detected MIME. The complete operation is safe to repeat.
- Removed links remain for audit. A removed object is eligible for deletion only after retention and only when no active link exists.
- Upload and download bytes flow directly between the browser and R2; the backend streams object bytes only for server-side content verification.
