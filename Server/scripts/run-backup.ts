import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/database/prisma.service';
import { OperationsMetricsService } from '../src/modules/observability/operations-metrics.service';
import { BackupService } from '../src/modules/operations/backup.service';
import { BackupStorageService } from '../src/modules/operations/backup-storage.service';

async function main(): Promise<void> {
  if (process.argv[2] !== '--confirm') {
    throw new Error(
      'Run with --confirm to create an encrypted database backup',
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
    process.stdout.write(`${JSON.stringify(await backups.runNow())}\n`);
  } finally {
    await prisma.onModuleDestroy();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Backup command failed'}\n`,
  );
  process.exitCode = 1;
});
