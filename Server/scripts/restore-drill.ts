import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service';
import { OperationsMetricsService } from '../src/modules/observability/operations-metrics.service';
import { BackupService } from '../src/modules/operations/backup.service';
import { BackupStorageService } from '../src/modules/operations/backup-storage.service';

async function main(): Promise<void> {
  if (process.argv[2] !== '--confirm') {
    throw new Error(
      'Run with --confirm after configuring RESTORE_DRILL_DATABASE_URL to an empty, isolated office_workspace_restore_verify* database',
    );
  }
  const config = new ConfigService(process.env);
  const prisma = new PrismaService();
  await prisma.onModuleInit();
  try {
    const backups = new BackupService(
      prisma,
      config,
      new BackupStorageService(config),
      new OperationsMetricsService(),
    );
    process.stdout.write(
      `${JSON.stringify(await backups.runRestoreDrill())}\n`,
    );
  } finally {
    await prisma.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Restore drill failed'}\n`,
  );
  process.exitCode = 1;
});
