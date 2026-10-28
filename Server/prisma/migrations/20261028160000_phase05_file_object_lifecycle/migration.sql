ALTER TABLE "file_objects"
  ADD COLUMN "upload_expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "purge_after" TIMESTAMPTZ(3),
  ADD COLUMN "purged_at" TIMESTAMPTZ(3);

UPDATE "file_objects"
SET "upload_expires_at" = "created_at" + INTERVAL '1 hour'
WHERE "status" = 'UPLOADING' AND "upload_expires_at" IS NULL;

UPDATE "file_objects"
SET "removed_at" = COALESCE("removed_at", "created_at"),
    "purge_after" = COALESCE("purge_after", COALESCE("removed_at", "created_at") + INTERVAL '90 days')
WHERE "status" = 'REMOVED';

-- The Phase 01 fixture used metadata-only demo objects. They were never in R2,
-- so do not leave them visible as READY after real storage is enabled.
UPDATE "file_objects"
SET "status" = 'REMOVED',
    "removed_at" = CURRENT_TIMESTAMP,
    "purge_after" = CURRENT_TIMESTAMP
WHERE "object_key" LIKE 'demo/%' AND "status" <> 'REMOVED';

UPDATE "file_links"
SET "removed_at" = CURRENT_TIMESTAMP
WHERE "removed_at" IS NULL
  AND "file_id" IN (
    SELECT "id" FROM "file_objects" WHERE "object_key" LIKE 'demo/%'
  );

ALTER TABLE "file_objects"
  ADD CONSTRAINT "file_objects_upload_expiry_check"
    CHECK ("status" <> 'UPLOADING' OR "upload_expires_at" IS NOT NULL),
  ADD CONSTRAINT "file_objects_removed_retention_check"
    CHECK ("status" <> 'REMOVED' OR ("removed_at" IS NOT NULL AND "purge_after" IS NOT NULL)),
  ADD CONSTRAINT "file_objects_purge_state_check"
    CHECK ("purged_at" IS NULL OR "status" = 'REMOVED');

CREATE INDEX "file_objects_upload_expiry_idx"
  ON "file_objects" ("status", "upload_expires_at", "id");

CREATE INDEX "file_objects_cleanup_idx"
  ON "file_objects" ("status", "purge_after", "id");
