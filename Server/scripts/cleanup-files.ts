import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FilesCleanupService } from '../src/modules/files/files-cleanup.service';
import { AppModule } from '../src/app.module';

async function main(): Promise<void> {
  const requestedBatch = Number(process.env.FILE_CLEANUP_BATCH_SIZE ?? 100);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  try {
    const cleanup = app.get(FilesCleanupService);
    const result = await cleanup.run(requestedBatch);
    console.log(JSON.stringify({ event: 'file_cleanup_complete', ...result }));
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'file_cleanup_failed',
      errorType: error instanceof Error ? error.name : 'UnknownError',
    }),
  );
  process.exitCode = 1;
});
