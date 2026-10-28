import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';

@Injectable()
export class BackupStorageService {
  private client?: S3Client;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.localRoot() || this.s3Config());
  }

  async upload(
    objectKey: string,
    encryptedFilePath: string,
    sizeBytes: number,
  ) {
    const localRoot = this.localRoot();
    if (localRoot) {
      const target = this.resolveLocalKey(localRoot, objectKey);
      await mkdir(dirname(target), { recursive: true });
      await pipeline(
        createReadStream(encryptedFilePath),
        createWriteStream(target, { flags: 'wx', mode: 0o600 }),
      );
      return;
    }
    const config = this.s3Config();
    if (!config) throw new Error('Backup storage is not configured');
    await this.s3Client(config).send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: objectKey,
        Body: createReadStream(encryptedFilePath),
        ContentLength: sizeBytes,
        ContentType: 'application/octet-stream',
        Metadata: { encrypted: 'aes-256-gcm' },
      }),
    );
  }

  async download(objectKey: string, targetPath: string): Promise<void> {
    const localRoot = this.localRoot();
    if (localRoot) {
      const source = this.resolveLocalKey(localRoot, objectKey);
      await pipeline(
        createReadStream(source),
        createWriteStream(targetPath, { flags: 'wx', mode: 0o600 }),
      );
      return;
    }
    const config = this.s3Config();
    if (!config) throw new Error('Backup storage is not configured');
    const result = await this.s3Client(config).send(
      new GetObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    );
    if (!result.Body) throw new Error('Backup object is empty');
    await mkdir(dirname(targetPath), { recursive: true });
    await pipeline(
      result.Body as Readable,
      createWriteStream(targetPath, { flags: 'wx', mode: 0o600 }),
    );
  }

  async delete(objectKey: string): Promise<void> {
    const localRoot = this.localRoot();
    if (localRoot) {
      await rm(this.resolveLocalKey(localRoot, objectKey), { force: true });
      return;
    }
    const config = this.s3Config();
    if (!config) throw new Error('Backup storage is not configured');
    await this.s3Client(config).send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: objectKey }),
    );
  }

  private s3Config(): {
    endpoint: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
  } | null {
    const endpoint = this.config.get<string>('BACKUP_S3_ENDPOINT', '');
    const accessKeyId = this.config.get<string>('BACKUP_S3_ACCESS_KEY_ID', '');
    const secretAccessKey = this.config.get<string>(
      'BACKUP_S3_SECRET_ACCESS_KEY',
      '',
    );
    const bucket = this.config.get<string>('BACKUP_BUCKET', '');
    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
    return {
      endpoint,
      accessKeyId,
      secretAccessKey,
      bucket,
      region: this.config.get<string>('BACKUP_S3_REGION', 'auto'),
    };
  }

  private s3Client(
    config: NonNullable<ReturnType<typeof this.s3Config>>,
  ): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
    }
    return this.client;
  }

  private localRoot(): string | null {
    const configured = this.config.get<string>('BACKUP_LOCAL_DIR', '');
    if (!configured) return null;
    if (
      this.config.get<string>('APP_ENV') !== 'local' ||
      !isAbsolute(configured)
    ) {
      throw new Error(
        'Local backup storage is allowed only at an absolute local path',
      );
    }
    return resolve(configured);
  }

  private resolveLocalKey(root: string, objectKey: string): string {
    if (!/^[A-Za-z0-9/_\-.]+$/.test(objectKey) || objectKey.includes('..')) {
      throw new Error('Invalid backup object key');
    }
    const target = resolve(root, ...objectKey.split('/'));
    const relativePath = relative(root, target);
    if (
      !relativePath ||
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`)
    ) {
      throw new Error('Backup object path escapes its configured root');
    }
    return target;
  }
}
