import { Inject, Injectable } from '@nestjs/common';
import { FileStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FilesService } from './files.service';
import { R2StorageService } from './r2-storage.service';

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;

type CleanupFile = { id: string; objectKey: string; status: FileStatus };

@Injectable()
export class FilesCleanupService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(FilesService)
    private readonly files: FilesService,
    @Inject(R2StorageService)
    private readonly storage: R2StorageService,
  ) {}

  async run(batchSize = DEFAULT_BATCH_SIZE) {
    if (
      !Number.isInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > MAX_BATCH_SIZE
    ) {
      throw new Error(`batchSize must be between 1 and ${MAX_BATCH_SIZE}`);
    }

    const now = new Date();
    const expired = await this.prisma.$queryRaw<CleanupFile[]>`
      SELECT id::text, object_key AS "objectKey", status
      FROM file_objects
      WHERE status = 'UPLOADING'::"FileStatus"
        AND upload_expires_at <= ${now}
      ORDER BY upload_expires_at ASC, id ASC
      LIMIT ${batchSize}
    `;

    const expiredMarked: typeof expired = [];
    for (const file of expired) {
      const marked = await this.files.markUploadRemoved(
        file,
        null,
        now,
        'FILE_UPLOAD_EXPIRED',
      );
      if (marked) expiredMarked.push(file);
    }

    const remaining = Math.max(0, batchSize - expiredMarked.length);
    const due =
      remaining === 0
        ? []
        : await this.prisma.$queryRaw<Array<{ id: string; objectKey: string }>>`
            SELECT file_objects.id::text, file_objects.object_key AS "objectKey"
            FROM file_objects
            WHERE file_objects.status = 'REMOVED'::"FileStatus"
              AND file_objects.purge_after <= ${now}
              AND file_objects.purged_at IS NULL
              AND NOT EXISTS (
                SELECT 1 FROM file_links
                WHERE file_links.file_id = file_objects.id
                  AND file_links.removed_at IS NULL
              )
            ORDER BY file_objects.purge_after ASC, file_objects.id ASC
            LIMIT ${remaining}
          `;
    const filesToDelete = [...expiredMarked, ...due].slice(0, batchSize);

    let purged = 0;
    let failed = 0;
    for (const file of filesToDelete) {
      try {
        await this.storage.deleteObject(file.objectKey);
        if (await this.files.recordPurged(file, new Date())) purged += 1;
      } catch (error) {
        failed += 1;
        process.stderr.write(
          `${JSON.stringify({
            level: 'error',
            event: 'file_cleanup_error',
            fileId: file.id,
            errorType: error instanceof Error ? error.name : 'UnknownError',
          })}\n`,
        );
      }
    }
    return {
      batchSize,
      expiredMarked: expiredMarked.length,
      purged,
      failed,
      hasMore:
        expired.length === batchSize ||
        (remaining > 0 && due.length === remaining) ||
        failed > 0,
    };
  }
}
