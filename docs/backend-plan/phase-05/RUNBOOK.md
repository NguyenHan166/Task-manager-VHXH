# Phase 05 — R2 setup and operations

## Private bucket setup

Create a dedicated Cloudflare R2 bucket for application files. Keep public access disabled: do not enable `r2.dev`, attach a public custom domain, or grant anonymous `GetObject` access. Create an R2 API token with Object Read and Object Write permissions scoped to this bucket only. Store its access key and secret only in the backend environment; never expose them to the frontend or logs.

Set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_FILE_BUCKET`. The backend derives the default S3 endpoint from the account ID. `R2_ENDPOINT` is optional for local S3-compatible development; staging and production must use `https://<account-id>.r2.cloudflarestorage.com`. Do not configure a public URL for application downloads.

Verify privacy separately from CORS. In the bucket's **Settings**, disable **Public Development URL** and confirm every **Custom Domain** is disabled or removed. R2's `r2.dev` URL and custom domains are independent public access paths; disabling one does not disable the other. Cloudflare's [public bucket guide](https://developers.cloudflare.com/r2/buckets/public-buckets/) documents these controls.

## Bucket CORS

Set one exact entry for each deployed frontend origin. Do not use `*`; include the origin only, without a path or trailing slash. This lets a browser PUT directly to the presigned URL while keeping object access private.

```json
[
  {
    "AllowedOrigins": ["https://<frontend-host>"],
    "AllowedMethods": ["PUT", "GET"],
    "AllowedHeaders": ["Content-Type", "Content-Length", "If-None-Match"],
    "ExposeHeaders": ["ETag", "Content-Length"],
    "MaxAgeSeconds": 3600
  }
]
```

The upload request must send the `Content-Type` and `If-None-Match: *` headers returned by `POST /api/files/upload-url`. The browser sends the body directly to R2. It then calls `POST /api/files/complete`; only after R2 confirms the object and the backend verifies its size, SHA-256 and detected type can it become READY. Downloads use a fresh signed GET URL with an attachment disposition.

## Limits and retention

- `MAX_FILE_SIZE_MB` defaults to 20. The effective maximum is the lower of this setting and `app_settings.max_file_size_mb`.
- `R2_SIGNED_URL_TTL_SECONDS` defaults to 300 and must be between 60 and 900.
- The server accepts only the formats in [`MIME_ALLOWLIST.md`](./MIME_ALLOWLIST.md).
- Removal blocks new signed downloads immediately. The cleanup command deletes an object only after its retention date and after checking that no active file link remains. `FILE_REMOVED_RETENTION_DAYS` cannot be less than 90.
- Schedule `npm run files:cleanup` at least daily using the deployment platform's scheduler. Set `FILE_CLEANUP_BATCH_SIZE` from 1 to 500 as needed. Re-run after a failed batch; delete is safe to retry.
- UPLOADING records expire with the signed PUT URL. Cleanup marks abandoned records REMOVED and purges their objects in the same run when possible.

## Local verification

Use a seeded disposable database named `office_workspace_phase05_verify*`; never run the acceptance command against the normal development database. `npm run files:check` uses an in-process local S3-compatible test server. `npm run files:check -- --r2` additionally exercises the configured R2 bucket, verifies browser CORS and checks that an uploaded test object is not anonymously readable. The latter creates uniquely named temporary objects and removes them before exiting.

If an R2 request fails, the API returns a storage-unavailable error and leaves the object non-READY. Inspect the structured cleanup result and R2 health/permissions; do not mark records READY manually. The API never logs signed URLs, access keys, secret keys, or object keys.
