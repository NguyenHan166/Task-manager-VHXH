import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fileTypeFromBuffer } from 'file-type';

const TYPE_SAMPLE_BYTES = 256 * 1024;

export type InspectedObject = {
  byteLength: number;
  sha256: string;
  mimeType: string | null;
};

@Injectable()
export class R2StorageService {
  private s3Client: S3Client | null = null;
  private bucketName: string | null = null;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async createUploadUrl(input: {
    objectKey: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<string> {
    const { client, bucket } = this.requireStorage();
    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: input.objectKey,
        ContentType: input.mimeType,
        ContentLength: input.sizeBytes,
        IfNoneMatch: '*',
      });
      return await getSignedUrl(client, command, {
        expiresIn: this.signedUrlTtlSeconds(),
        signableHeaders: new Set([
          'content-type',
          'content-length',
          'if-none-match',
        ]),
      });
    } catch {
      throw this.unavailable();
    }
  }

  async createDownloadUrl(input: {
    objectKey: string;
    originalName: string;
  }): Promise<string> {
    const { client, bucket } = this.requireStorage();
    try {
      return await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: input.objectKey,
          ResponseContentType: 'application/octet-stream',
          ResponseContentDisposition: this.attachmentDisposition(
            input.originalName,
          ),
        }),
        { expiresIn: this.signedUrlTtlSeconds() },
      );
    } catch {
      throw this.unavailable();
    }
  }

  async headObject(objectKey: string): Promise<{ sizeBytes: number } | null> {
    const { client, bucket } = this.requireStorage();
    try {
      const result = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: objectKey }),
      );
      if (
        result.ContentLength === undefined ||
        !Number.isSafeInteger(result.ContentLength) ||
        result.ContentLength < 0
      ) {
        throw this.unavailable();
      }
      return { sizeBytes: result.ContentLength };
    } catch (error) {
      if (this.isMissingObject(error)) return null;
      if (error instanceof ServiceUnavailableException) throw error;
      throw this.unavailable();
    }
  }

  async inspectObject(objectKey: string): Promise<InspectedObject | null> {
    const { client, bucket } = this.requireStorage();
    let response;
    try {
      response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: objectKey }),
      );
    } catch (error) {
      if (this.isMissingObject(error)) return null;
      throw this.unavailable();
    }
    if (!response.Body) throw this.unavailable();

    const hash = createHash('sha256');
    const prefixParts: Buffer[] = [];
    let prefixLength = 0;
    let byteLength = 0;
    try {
      for await (const item of response.Body as AsyncIterable<Uint8Array>) {
        const chunk = Buffer.from(item);
        byteLength += chunk.length;
        hash.update(chunk);
        if (prefixLength < TYPE_SAMPLE_BYTES) {
          const selected = chunk.subarray(0, TYPE_SAMPLE_BYTES - prefixLength);
          prefixParts.push(Buffer.from(selected));
          prefixLength += selected.length;
        }
      }
    } catch {
      throw this.unavailable();
    }

    const prefix = Buffer.concat(prefixParts, prefixLength);
    let mimeType: string | null = null;
    try {
      mimeType = (await fileTypeFromBuffer(prefix))?.mime ?? null;
    } catch {
      mimeType = null;
    }
    return { byteLength, sha256: hash.digest('hex'), mimeType };
  }

  async deleteObject(objectKey: string): Promise<void> {
    const { client, bucket } = this.requireStorage();
    try {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }),
      );
    } catch (error) {
      if (this.isMissingObject(error)) return;
      throw this.unavailable();
    }
  }

  ttlSeconds(): number {
    return this.signedUrlTtlSeconds();
  }

  private requireStorage(): { client: S3Client; bucket: string } {
    const accountId = this.config.get<string>('R2_ACCOUNT_ID')?.trim();
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID')?.trim();
    const secretAccessKey = this.config
      .get<string>('R2_SECRET_ACCESS_KEY')
      ?.trim();
    const bucket = this.config.get<string>('R2_FILE_BUCKET')?.trim();
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
      throw this.unavailable();
    }
    if (!this.s3Client) {
      const endpoint =
        this.config.get<string>('R2_ENDPOINT')?.trim() ||
        `https://${accountId}.r2.cloudflarestorage.com`;
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        maxAttempts: 2,
      });
      this.bucketName = bucket;
    }
    return { client: this.s3Client, bucket: this.bucketName ?? bucket };
  }

  private signedUrlTtlSeconds(): number {
    return Number(this.config.get<string>('R2_SIGNED_URL_TTL_SECONDS') ?? 300);
  }

  private attachmentDisposition(originalName: string): string {
    const asciiName = originalName.replace(/[^\x20-\x7e]|["\\]/g, '_');
    const encodedName = encodeURIComponent(originalName).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
  }

  private isMissingObject(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const candidate = error as {
      name?: string;
      Code?: string;
      $metadata?: { httpStatusCode?: number };
    };
    return (
      candidate.$metadata?.httpStatusCode === 404 ||
      candidate.name === 'NotFound' ||
      candidate.name === 'NoSuchKey' ||
      candidate.Code === 'NoSuchKey'
    );
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'UNAVAILABLE',
      message: 'File storage is temporarily unavailable',
    });
  }
}
