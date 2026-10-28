import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const serverRequire = createRequire(resolve(process.cwd(), 'package.json'));
const { AppModule } = serverRequire(
  './dist/app.module.js',
) as typeof import('../src/app.module');
const { FilesCleanupService } = serverRequire(
  './dist/modules/files/files-cleanup.service.js',
) as typeof import('../src/modules/files/files-cleanup.service');

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
