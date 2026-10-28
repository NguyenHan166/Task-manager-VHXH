import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BackupRunStatus, Prisma } from '@prisma/client';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { PrismaService } from '../../database/prisma.service';
import { OperationsMetricsService } from '../observability/operations-metrics.service';
import { BackupStorageService } from './backup-storage.service';

const BACKUP_MAGIC = Buffer.from('OWBK1', 'ascii');
const BACKUP_HEADER_BYTES = BACKUP_MAGIC.length + 12;
const AUTH_TAG_BYTES = 16;
const RUNNING_STALE_MS = 30 * 60_000;

type DatabaseConnection = {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  sslMode?: string;
};

type TableCounts = { users: number; tasks: number; fileObjects: number };

@Injectable()
export class BackupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: BackupStorageService,
    private readonly metrics: OperationsMetricsService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.enabled()) {
      this.logger.warn(
        JSON.stringify({
          event: 'backup_disabled',
          reason: 'Encrypted backup storage or key is not configured',
        }),
      );
      return;
    }
    this.timer = setInterval(() => void this.checkSchedule(), 60_000);
    this.timer.unref();
    void this.checkSchedule(true);
    void this.runRetentionSafely();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runNow(): Promise<{ started: boolean; status: string }> {
    if (!this.enabled()) return { started: false, status: 'DISABLED' };
    const scheduledFor = this.scheduledFor(new Date());
    const started = await this.runBackup(scheduledFor);
    const run = await this.prisma.backupRun.findUnique({
      where: { scheduledFor },
      select: { status: true },
    });
    return {
      started,
      status: run?.status ?? (started ? 'SUCCEEDED' : 'ALREADY_PROCESSED'),
    };
  }

  async getStatus() {
    const [lastAttempt, lastSuccess, lastRestore] = await Promise.all([
      this.prisma.backupRun.findFirst({
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        select: { startedAt: true, status: true },
      }),
      this.prisma.backupRun.findFirst({
        where: { status: BackupRunStatus.SUCCEEDED },
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
        select: { completedAt: true },
      }),
      this.prisma.backupRun.findFirst({
        where: { restoreDrillAt: { not: null } },
        orderBy: [{ restoreDrillAt: 'desc' }, { id: 'desc' }],
        select: { restoreDrillAt: true },
      }),
    ]);
    return {
      lastAttemptAt: lastAttempt?.startedAt ?? null,
      lastSuccessAt: lastSuccess?.completedAt ?? null,
      status: lastAttempt?.status ?? 'NEVER',
      retentionDays: this.retentionDays(),
      lastRestoreDrillAt: lastRestore?.restoreDrillAt ?? null,
    };
  }

  async runRestoreDrill(): Promise<{
    status: 'SUCCEEDED';
    backupAt: Date;
    counts: TableCounts;
  }> {
    const targetUrl = this.config.get<string>('RESTORE_DRILL_DATABASE_URL', '');
    if (!targetUrl) throw new Error('RESTORE_DRILL_DATABASE_URL is required');
    const source = this.databaseConnection(
      this.config.getOrThrow<string>('DATABASE_URL'),
    );
    const target = this.databaseConnection(targetUrl);
    if (
      target.database === source.database &&
      target.host.toLowerCase() === source.host.toLowerCase() &&
      target.port === source.port
    ) {
      throw new Error(
        'Restore drill target must differ from the source database',
      );
    }
    if (!target.database.startsWith('office_workspace_restore_verify')) {
      throw new Error(
        'Restore target must use the office_workspace_restore_verify prefix',
      );
    }
    if (
      this.config.get<string>('APP_ENV') === 'production' &&
      target.host.toLowerCase() === source.host.toLowerCase()
    ) {
      throw new Error(
        'Production restore drills require a separate database host',
      );
    }
    const backup = await this.prisma.backupRun.findFirst({
      where: {
        status: BackupRunStatus.SUCCEEDED,
        objectKey: { not: null },
        expiredAt: null,
        sourceCounts: { not: Prisma.DbNull },
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
    });
    if (!backup?.objectKey || !backup.sourceCounts) {
      throw new Error(
        'No retained successful backup is available for a restore drill',
      );
    }

    const workDir = await mkdtemp(join(tmpdir(), 'office-workspace-restore-'));
    const encryptedPath = join(workDir, 'backup.owbk');
    let drillStatus: 'SUCCEEDED' | 'FAILED' = 'FAILED';
    try {
      await this.storage.download(backup.objectKey, encryptedPath);
      const existingTables = await this.runProcess(
        'PSQL_BIN',
        [
          ...this.connectionArgs(target),
          '--no-psqlrc',
          '--tuples-only',
          '--no-align',
          '--command',
          "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p')",
        ],
        target,
      );
      if (Number(existingTables) !== 0) {
        throw new Error('Restore target must be an empty database');
      }
      await this.restoreDump(encryptedPath, target);
      const counts = await this.readTableCounts(target);
      const expected = backup.sourceCounts as unknown as TableCounts;
      if (
        counts.users !== expected.users ||
        counts.tasks !== expected.tasks ||
        counts.fileObjects !== expected.fileObjects
      ) {
        throw new Error('Restored table counts did not match backup metadata');
      }
      drillStatus = 'SUCCEEDED';
      await this.prisma.backupRun.update({
        where: { id: backup.id },
        data: { restoreDrillAt: new Date(), restoreDrillStatus: drillStatus },
      });
      await this.writeAudit('BACKUP_RESTORE_DRILL_SUCCEEDED', backup.id, {
        users: counts.users,
        tasks: counts.tasks,
        fileObjects: counts.fileObjects,
      });
      this.metrics.increment('backup_restore_drills_succeeded');
      this.logger.log(
        JSON.stringify({
          event: 'backup_restore_drill_succeeded',
          backupId: backup.id,
          users: counts.users,
          tasks: counts.tasks,
          fileObjects: counts.fileObjects,
        }),
      );
      return { status: 'SUCCEEDED', backupAt: backup.completedAt!, counts };
    } catch {
      await this.prisma.backupRun.update({
        where: { id: backup.id },
        data: { restoreDrillAt: new Date(), restoreDrillStatus: drillStatus },
      });
      await this.writeAudit('BACKUP_RESTORE_DRILL_FAILED', backup.id, {
        status: drillStatus,
      });
      this.metrics.increment('backup_restore_drills_failed');
      this.logger.error(
        JSON.stringify({
          event: 'backup_restore_drill_failed',
          backupId: backup.id,
          reason: 'RESTORE_VERIFICATION_FAILED',
        }),
      );
      throw new Error(
        'Restore drill failed; inspect the isolated target and operational logs',
      );
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  private enabled(): boolean {
    return (
      this.storage.isConfigured() &&
      /^[a-f0-9]{64}$/i.test(
        this.config.get<string>('BACKUP_ENCRYPTION_KEY', ''),
      )
    );
  }

  private async checkSchedule(catchUp = false): Promise<void> {
    try {
      if (this.running || !this.enabled()) return;
      const schedule = this.scheduleUtc();
      const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(schedule);
      if (!match) return;
      const now = new Date();
      const minuteOfDay = now.getUTCHours() * 60 + now.getUTCMinutes();
      const scheduledMinute = Number(match[1]) * 60 + Number(match[2]);
      if (
        minuteOfDay === scheduledMinute ||
        (catchUp && minuteOfDay > scheduledMinute)
      ) {
        await this.runBackup(this.scheduledFor(now));
        await this.runRetentionSafely();
      }
    } catch {
      this.metrics.increment('backup_scheduler_failures');
      this.logger.error(
        JSON.stringify({
          event: 'backup_scheduler_failed',
          reason: 'SCHEDULE_CHECK_FAILED',
        }),
      );
    }
  }

  private scheduledFor(now: Date): Date {
    const schedule = this.scheduleUtc();
    const [hour = '02', minute = '00'] = schedule.split(':');
    return new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        Number(hour),
        Number(minute),
      ),
    );
  }

  private scheduleUtc(): string {
    return (
      this.config.get<string>('BACKUP_SCHEDULE_UTC', '')?.trim() || '02:00'
    );
  }

  private async runBackup(scheduledFor: Date): Promise<boolean> {
    if (this.running || !this.enabled()) return false;
    const run = await this.claimRun(scheduledFor);
    if (!run) {
      this.metrics.increment('backup_deduplicated_runs');
      return false;
    }
    this.running = true;
    this.metrics.increment('backup_runs_started');
    let workDir: string | undefined;
    let objectKey: string | undefined;
    try {
      workDir = await mkdtemp(join(tmpdir(), 'office-workspace-backup-'));
      const encryptedPath = join(workDir, 'database.owbk');
      objectKey = `backups/${scheduledFor.toISOString().slice(0, 10)}/${randomUUID()}.owbk`;
      const sourceCounts = await this.prisma.$transaction(
        async (tx) => {
          const [snapshot] = await tx.$queryRaw<Array<{ snapshot: string }>>`
            SELECT pg_export_snapshot() AS "snapshot"
          `;
          const [users, tasks, fileObjects] = await Promise.all([
            tx.user.count(),
            tx.task.count(),
            tx.fileObject.count(),
          ]);
          await this.writeEncryptedDump(snapshot!.snapshot, encryptedPath);
          return { users, tasks, fileObjects } satisfies Prisma.InputJsonObject;
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
          maxWait: 10_000,
          timeout: 15 * 60_000,
        },
      );
      const sizeBytes = (await stat(encryptedPath)).size;
      const checksum = await this.fileChecksum(encryptedPath);
      await this.storage.upload(objectKey, encryptedPath, sizeBytes);
      const completedAt = new Date();
      await this.prisma.backupRun.update({
        where: { id: run.id },
        data: {
          status: BackupRunStatus.SUCCEEDED,
          objectKey,
          checksum,
          sizeBytes: BigInt(sizeBytes),
          sourceCounts,
          completedAt,
          errorCode: null,
        },
      });
      await this.writeAudit('BACKUP_SUCCEEDED', run.id, {
        status: 'SUCCEEDED',
        sizeBytes,
        checksum,
        ...sourceCounts,
      });
      this.metrics.increment('backup_runs_succeeded');
      this.logger.log(
        JSON.stringify({
          event: 'backup_succeeded',
          backupId: run.id,
          sizeBytes,
          checksum,
          ...sourceCounts,
        }),
      );
      await this.runRetentionSafely();
      return true;
    } catch {
      if (objectKey) await this.deleteBackupObjectSafely(objectKey);
      await this.prisma.backupRun.update({
        where: { id: run.id },
        data: {
          status: BackupRunStatus.FAILED,
          completedAt: new Date(),
          errorCode: 'BACKUP_FAILED',
        },
      });
      await this.writeAudit('BACKUP_FAILED', run.id, {
        status: 'FAILED',
        errorCode: 'BACKUP_FAILED',
      });
      this.metrics.increment('backup_runs_failed');
      this.logger.error(
        JSON.stringify({
          event: 'backup_failed',
          backupId: run.id,
          reason: 'BACKUP_FAILED',
        }),
      );
      return false;
    } finally {
      this.running = false;
      if (workDir) await rm(workDir, { recursive: true, force: true });
    }
  }

  private async deleteBackupObjectSafely(objectKey: string): Promise<void> {
    try {
      await this.storage.delete(objectKey);
    } catch {
      this.metrics.increment('backup_orphan_cleanup_failures');
      this.logger.error(
        JSON.stringify({
          event: 'backup_orphan_cleanup_failed',
          reason: 'OBJECT_CLEANUP_FAILED',
        }),
      );
    }
  }

  private async claimRun(scheduledFor: Date) {
    const current = await this.prisma.backupRun.findUnique({
      where: { scheduledFor },
    });
    const now = new Date();
    if (current?.status === BackupRunStatus.SUCCEEDED) return null;
    if (
      current?.status === BackupRunStatus.RUNNING &&
      now.getTime() - current.startedAt.getTime() < RUNNING_STALE_MS
    ) {
      return null;
    }
    if (current) {
      const claimed = await this.prisma.backupRun.updateMany({
        where: {
          id: current.id,
          OR: [
            { status: BackupRunStatus.FAILED },
            {
              status: BackupRunStatus.RUNNING,
              startedAt: { lt: new Date(now.getTime() - RUNNING_STALE_MS) },
            },
          ],
        },
        data: {
          status: BackupRunStatus.RUNNING,
          startedAt: now,
          completedAt: null,
          objectKey: null,
          checksum: null,
          sizeBytes: null,
          sourceCounts: Prisma.DbNull,
          errorCode: null,
        },
      });
      return claimed.count ? { id: current.id } : null;
    }
    try {
      return await this.prisma.backupRun.create({
        data: {
          scheduledFor,
          status: BackupRunStatus.RUNNING,
          startedAt: now,
        },
        select: { id: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }
      throw error;
    }
  }

  private async writeEncryptedDump(snapshot: string, targetPath: string) {
    const connection = this.databaseConnection(
      this.config.getOrThrow<string>('DATABASE_URL'),
    );
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      Buffer.from(
        this.config.getOrThrow<string>('BACKUP_ENCRYPTION_KEY'),
        'hex',
      ),
      iv,
    );
    const child = this.spawnPostgresClient(
      'PG_DUMP_BIN',
      [
        '--format=custom',
        '--compress=1',
        '--no-owner',
        '--no-acl',
        '--host',
        connection.host,
        '--port',
        String(connection.port),
        '--username',
        connection.user,
        '--dbname',
        connection.database,
        '--snapshot',
        snapshot,
      ],
      connection,
      ['ignore', 'pipe', 'ignore'],
    );
    const processExit = this.waitForExit(child);
    const source = async function* () {
      yield Buffer.concat([BACKUP_MAGIC, iv]);
      for await (const chunk of child.stdout!) {
        const encrypted = cipher.update(chunk as Buffer);
        if (encrypted.length) yield encrypted;
      }
      const final = cipher.final();
      if (final.length) yield final;
      yield cipher.getAuthTag();
    };
    await pipeline(
      Readable.from(source()),
      createWriteStream(targetPath, { flags: 'wx', mode: 0o600 }),
    );
    const result = await processExit;
    if (result !== 0) throw new Error('pg_dump failed');
  }

  private async restoreDump(encryptedPath: string, target: DatabaseConnection) {
    const sizeBytes = (await stat(encryptedPath)).size;
    if (sizeBytes < BACKUP_HEADER_BYTES + AUTH_TAG_BYTES) {
      throw new Error('Encrypted backup is truncated');
    }
    const handle = await open(encryptedPath, 'r');
    const header = Buffer.alloc(BACKUP_HEADER_BYTES);
    const authTag = Buffer.alloc(AUTH_TAG_BYTES);
    try {
      await handle.read(header, 0, header.length, 0);
      await handle.read(authTag, 0, authTag.length, sizeBytes - AUTH_TAG_BYTES);
    } finally {
      await handle.close();
    }
    if (!header.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC)) {
      throw new Error('Encrypted backup format is not recognized');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(
        this.config.getOrThrow<string>('BACKUP_ENCRYPTION_KEY'),
        'hex',
      ),
      header.subarray(BACKUP_MAGIC.length),
    );
    decipher.setAuthTag(authTag);
    const ciphertext = createReadStream(encryptedPath, {
      start: BACKUP_HEADER_BYTES,
      end: sizeBytes - AUTH_TAG_BYTES - 1,
    });
    const plaintext = async function* () {
      for await (const chunk of ciphertext) {
        const decrypted = decipher.update(chunk as Buffer);
        if (decrypted.length) yield decrypted;
      }
      const final = decipher.final();
      if (final.length) yield final;
    };
    const child = this.spawnPostgresClient(
      'PG_RESTORE_BIN',
      [
        '--exit-on-error',
        '--no-owner',
        '--no-acl',
        '--host',
        target.host,
        '--port',
        String(target.port),
        '--username',
        target.user,
        '--dbname',
        target.database,
      ],
      target,
      ['pipe', 'ignore', 'ignore'],
    );
    const processExit = this.waitForExit(child);
    await pipeline(Readable.from(plaintext()), child.stdin!);
    const result = await processExit;
    if (result !== 0) throw new Error('pg_restore failed');
  }

  private async readTableCounts(
    connection: DatabaseConnection,
  ): Promise<TableCounts> {
    const output = await this.runProcess(
      'PSQL_BIN',
      [
        ...this.connectionArgs(connection),
        '--no-psqlrc',
        '--tuples-only',
        '--no-align',
        '--command',
        'SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM tasks), (SELECT count(*) FROM file_objects)',
      ],
      connection,
    );
    const [users, tasks, fileObjects] = output.split('|').map(Number);
    if (![users, tasks, fileObjects].every(Number.isSafeInteger)) {
      throw new Error('Could not read restored table counts');
    }
    return { users, tasks, fileObjects };
  }

  private async runRetentionSafely(): Promise<void> {
    try {
      const cutoff = new Date(
        Date.now() - this.retentionDays() * 24 * 60 * 60_000,
      );
      const expired = await this.prisma.backupRun.findMany({
        where: {
          status: BackupRunStatus.SUCCEEDED,
          expiredAt: null,
          objectKey: { not: null },
          completedAt: { lt: cutoff },
        },
        orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
        take: 100,
        select: { id: true, objectKey: true },
      });
      for (const backup of expired) {
        if (!backup.objectKey) continue;
        await this.storage.delete(backup.objectKey);
        await this.prisma.backupRun.update({
          where: { id: backup.id },
          data: { objectKey: null, expiredAt: new Date() },
        });
        this.metrics.increment('backup_objects_expired');
      }
    } catch {
      this.metrics.increment('backup_retention_failures');
      this.logger.error(
        JSON.stringify({
          event: 'backup_retention_failed',
          reason: 'RETENTION_CLEANUP_FAILED',
        }),
      );
    }
  }

  private retentionDays(): number {
    return Math.max(
      30,
      Number(this.config.get<string>('BACKUP_RETENTION_DAYS', '30')),
    );
  }

  private async fileChecksum(filePath: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filePath)) {
      hash.update(chunk as Buffer);
    }
    return hash.digest('hex');
  }

  private databaseConnection(value: string): DatabaseConnection {
    const url = new URL(value);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      throw new Error('A PostgreSQL connection URL is required');
    }
    const sslMode = url.searchParams.get('sslmode') ?? undefined;
    return {
      host: url.hostname,
      port: url.port ? Number(url.port) : 5432,
      database: decodeURIComponent(url.pathname.slice(1)),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ...(sslMode ? { sslMode } : {}),
    };
  }

  private processEnv(connection: DatabaseConnection): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {
      ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
      ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
      PGPASSWORD: connection.password,
      PGCONNECT_TIMEOUT: '10',
      ...(connection.sslMode ? { PGSSLMODE: connection.sslMode } : {}),
    };
    for (const key of [
      'HOME',
      'USERPROFILE',
      'APPDATA',
      'LOCALAPPDATA',
      'DOCKER_HOST',
      'DOCKER_CONTEXT',
      'DOCKER_CONFIG',
    ]) {
      const value = process.env[key];
      if (value) env[key] = value;
    }
    return {
      ...env,
    };
  }

  private connectionArgs(connection: DatabaseConnection): string[] {
    return [
      '--host',
      connection.host,
      '--port',
      String(connection.port),
      '--username',
      connection.user,
      '--dbname',
      connection.database,
    ];
  }

  private runProcess(
    binarySetting: 'PSQL_BIN',
    args: string[],
    connection: DatabaseConnection,
  ): Promise<string> {
    const child = this.spawnPostgresClient(binarySetting, args, connection, [
      'ignore',
      'pipe',
      'ignore',
    ]);
    const output: Buffer[] = [];
    let bytes = 0;
    child.stdout?.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes <= 64 * 1024) output.push(chunk);
    });
    return this.waitForExit(child).then((code) => {
      if (code !== 0) {
        throw new Error(
          `${this.config.get<string>(binarySetting, 'psql')} failed`,
        );
      }
      return Buffer.concat(output).toString('utf8').trim();
    });
  }

  private spawnPostgresClient(
    binarySetting: 'PG_DUMP_BIN' | 'PG_RESTORE_BIN' | 'PSQL_BIN',
    args: string[],
    connection: DatabaseConnection,
    stdio: ['ignore', 'pipe', 'ignore'] | ['pipe', 'ignore', 'ignore'],
  ): ReturnType<typeof spawn> {
    const binary = this.config.get<string>(
      binarySetting,
      binarySetting === 'PG_DUMP_BIN'
        ? 'pg_dump'
        : binarySetting === 'PG_RESTORE_BIN'
          ? 'pg_restore'
          : 'psql',
    );
    const env = this.processEnv(connection);
    const container = this.config.get<string>('PG_CLIENT_DOCKER_CONTAINER', '');
    if (!container) return spawn(binary, args, { stdio, env });
    if (
      this.config.get<string>('APP_ENV') !== 'local' ||
      !['localhost', '127.0.0.1', '::1'].includes(connection.host)
    ) {
      throw new Error(
        'Docker PostgreSQL client runner is allowed only for local loopback databases',
      );
    }
    const containerArgs = [...args];
    for (let index = 0; index < containerArgs.length - 1; index += 1) {
      if (containerArgs[index] === '--host')
        containerArgs[index + 1] = '127.0.0.1';
      if (containerArgs[index] === '--port') containerArgs[index + 1] = '5432';
    }
    return spawn(
      'docker',
      ['exec', '-i', '-e', 'PGPASSWORD', container, binary, ...containerArgs],
      { stdio, env },
    );
  }

  private waitForExit(child: ReturnType<typeof spawn>): Promise<number> {
    return new Promise((resolve, reject) => {
      child.once('error', () =>
        reject(new Error('PostgreSQL client command could not start')),
      );
      child.once('close', (code) => resolve(code ?? 1));
    });
  }

  private async writeAudit(
    action: string,
    backupId: string,
    after: Prisma.InputJsonObject,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action,
        entity: 'BackupRun',
        entityId: backupId,
        after,
      },
    });
  }
}
