import 'dotenv/config';
import 'reflect-metadata';
import assert from 'node:assert/strict';
import type { INestApplicationContext } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';

type ApiReply = {
  status: number;
  data: unknown;
  error?: { code?: string; message?: string };
};
type Session = { accessToken: string; user: { id: string } };
type UploadTicket = {
  fileId: string;
  uploadUrl: string;
  expiresAt: string;
  requiredHeaders: Record<string, string>;
};
type UploadedFile = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
};
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
type MockObject = { bytes: Buffer; mimeType: string };

const liveR2 = process.argv.includes('--r2');
const databaseUrl = process.env.DATABASE_URL;
const demoPassword = process.env.DEMO_SEED_PASSWORD;
const frontendOrigin = (process.env.FRONTEND_ORIGINS ?? '')
  .split(',')
  .map((value) => value.trim())
  .find(Boolean);
if (!databaseUrl || !demoPassword || !frontendOrigin) {
  throw new Error(
    'DATABASE_URL, DEMO_SEED_PASSWORD and FRONTEND_ORIGINS are required.',
  );
}
const parsedDatabaseUrl = new URL(databaseUrl);
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.slice(1));
if (!['localhost', '127.0.0.1', '::1'].includes(parsedDatabaseUrl.hostname)) {
  throw new Error('File checks only run against a localhost database.');
}
if (
  process.env.CI !== 'true' &&
  !databaseName.startsWith('office_workspace_phase05_verify')
) {
  throw new Error(
    'Use a disposable database named office_workspace_phase05_verify*; the normal local database is refused.',
  );
}
if (liveR2 && process.env.CI === 'true') {
  throw new Error('Live R2 checks are disabled in CI.');
}
if (liveR2 && process.env.APP_ENV !== 'local') {
  throw new Error('Live R2 acceptance must use APP_ENV=local.');
}
const r2Keys = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_FILE_BUCKET',
] as const;
if (liveR2 && r2Keys.some((key) => !process.env[key]?.trim())) {
  throw new Error('Live R2 acceptance requires complete R2 configuration.');
}
const fixture = JSON.parse(
  readFileSync(
    resolve(process.cwd(), '../docs/backend-plan/phase-00/kpi-fixture.v1.json'),
    'utf8',
  ),
) as { users: Array<{ alias: string; email: string }> };
const users = new Map(fixture.users.map((user) => [user.alias, user]));
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pXcAAAAASUVORK5CYII=',
  'base64',
);
const uploadedIds = new Set<string>();
const prisma = new PrismaClient();
let apiProcess: ChildProcess | null = null;
let mockStorage: Awaited<ReturnType<typeof startMockStorage>> | null = null;
let appContext: INestApplicationContext | null = null;
let cleanupCompleted = false;
let rawStorageClient: S3Client | null = null;
let apiBaseUrl: URL;
let testResults = 0;

function objectKey(fileId: string): string {
  return `private/${fileId.slice(0, 2)}/${fileId}`;
}

function recordResult(): void {
  testResults += 1;
}

function check(condition: unknown, message: string): asserts condition {
  assert.ok(condition, message);
  recordResult();
}

function expect<T>(reply: ApiReply, status: number, label: string): T {
  assert.equal(reply.status, status, `${label}: ${reply.error?.code ?? ''}`);
  recordResult();
  return reply.data as T;
}

async function request(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<ApiReply> {
  const response = await fetch(
    new URL(path.replace(/^\//, ''), `${apiBaseUrl.href.replace(/\/$/, '')}/`),
    {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
  );
  const payload = (await response.json()) as {
    data?: unknown;
    error?: { code?: string; message?: string };
  };
  return { status: response.status, data: payload.data, error: payload.error };
}

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Could not reserve an API port.');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

function sendXml(response: ServerResponse, status: number, code: string): void {
  response.writeHead(status, { 'content-type': 'application/xml' });
  response.end(`<Error><Code>${code}</Code><Message>${code}</Message></Error>`);
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const parts: Buffer[] = [];
  for await (const chunk of request) parts.push(Buffer.from(chunk));
  return Buffer.concat(parts);
}

async function startMockStorage() {
  const objects = new Map<string, MockObject>();
  let failHeadCount = 0;
  const allowedOrigins = (process.env.FRONTEND_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim());
  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
      const origin = request.headers.origin;
      if (request.method === 'OPTIONS') {
        if (origin && allowedOrigins.includes(origin)) {
          response.setHeader('access-control-allow-origin', origin);
          response.setHeader('access-control-allow-methods', 'PUT, GET');
          response.setHeader(
            'access-control-allow-headers',
            'content-type, content-length, if-none-match',
          );
          response.setHeader('access-control-max-age', '3600');
          response.setHeader('vary', 'Origin');
          response.writeHead(204).end();
        } else {
          response.writeHead(403).end();
        }
        return;
      }

      const pathParts = url.pathname.split('/').filter(Boolean);
      const key = decodeURIComponent(pathParts.slice(1).join('/'));
      const presigned = url.searchParams.has('X-Amz-Signature');
      const authorized =
        presigned ||
        (request.headers.authorization ?? '').startsWith('AWS4-HMAC-SHA256 ');
      if (!authorized) {
        sendXml(response, 403, 'AccessDenied');
        return;
      }
      if (presigned) {
        const signedHeaders = url.searchParams.get('X-Amz-SignedHeaders') ?? '';
        const expires = Number(url.searchParams.get('X-Amz-Expires'));
        const signedAt = url.searchParams.get('X-Amz-Date') ?? '';
        const signedTime = Date.parse(
          `${signedAt.slice(0, 4)}-${signedAt.slice(4, 6)}-${signedAt.slice(6, 8)}T${signedAt.slice(9, 11)}:${signedAt.slice(11, 13)}:${signedAt.slice(13, 15)}Z`,
        );
        if (
          !signedHeaders.includes('host') ||
          !url.searchParams.get('X-Amz-Credential') ||
          !Number.isInteger(expires) ||
          !Number.isFinite(signedTime) ||
          Date.now() > signedTime + expires * 1000
        ) {
          sendXml(response, 403, 'SignatureDoesNotMatch');
          return;
        }
      }

      const object = objects.get(key);
      if (request.method === 'PUT') {
        if (request.headers['if-none-match'] !== '*') {
          sendXml(response, 400, 'PreconditionRequired');
          return;
        }
        if (object) {
          sendXml(response, 412, 'PreconditionFailed');
          return;
        }
        const bytes = await readBody(request);
        if (
          request.headers['content-length'] !== undefined &&
          Number(request.headers['content-length']) !== bytes.length
        ) {
          sendXml(response, 400, 'BadDigest');
          return;
        }
        objects.set(key, {
          bytes,
          mimeType: String(request.headers['content-type'] ?? ''),
        });
        response
          .writeHead(200, { etag: `"${bytes.length.toString(16)}"` })
          .end();
        return;
      }
      if (request.method === 'HEAD') {
        if (failHeadCount > 0) {
          failHeadCount -= 1;
          sendXml(response, 503, 'SlowDown');
          return;
        }
        if (!object) {
          sendXml(response, 404, 'NoSuchKey');
          return;
        }
        response
          .writeHead(200, {
            'content-length': object.bytes.length,
            'content-type': object.mimeType,
          })
          .end();
        return;
      }
      if (request.method === 'GET') {
        if (!object) {
          sendXml(response, 404, 'NoSuchKey');
          return;
        }
        response
          .writeHead(200, {
            'content-length': object.bytes.length,
            'content-type':
              url.searchParams.get('response-content-type') ?? object.mimeType,
            ...(url.searchParams.get('response-content-disposition')
              ? {
                  'content-disposition': url.searchParams.get(
                    'response-content-disposition',
                  )!,
                }
              : {}),
          })
          .end(object.bytes);
        return;
      }
      if (request.method === 'DELETE') {
        objects.delete(key);
        response.writeHead(204).end();
        return;
      }
      response.writeHead(405).end();
    })().catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Could not start local storage test server.');
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    objects,
    failHeads(count: number) {
      failHeadCount = count;
    },
    seedObject(key: string, bytes: Buffer, mimeType: string) {
      objects.set(key, { bytes, mimeType });
    },
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function startApi(): Promise<void> {
  const port = await freePort();
  apiBaseUrl = new URL(`http://127.0.0.1:${port}/api`);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    APP_ENV: 'local',
    PORT: String(port),
    R2_SIGNED_URL_TTL_SECONDS: process.env.R2_SIGNED_URL_TTL_SECONDS ?? '300',
  };
  if (!liveR2) {
    env.R2_ACCOUNT_ID = '00000000000000000000000000000000';
    env.R2_ACCESS_KEY_ID = 'phase05-test-access-key';
    env.R2_SECRET_ACCESS_KEY = 'phase05-test-secret-key';
    env.R2_FILE_BUCKET = 'phase05-check';
    env.R2_ENDPOINT = mockStorage!.endpoint;
  }
  apiProcess = spawn(process.execPath, ['dist/main.js'], {
    cwd: process.cwd(),
    env,
    stdio: 'ignore',
    windowsHide: true,
  });
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (apiProcess.exitCode !== null) {
      throw new Error(
        `File acceptance API exited during startup (${apiProcess.exitCode}).`,
      );
    }
    try {
      const response = await fetch(new URL('/api/health/ready', apiBaseUrl));
      if (response.ok) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('File acceptance API did not become ready.');
}

async function stopApi(): Promise<void> {
  if (!apiProcess || apiProcess.exitCode !== null) return;
  const processToStop = apiProcess;
  processToStop.kill();
  const stopped = await Promise.race([
    once(processToStop, 'exit').then(() => true),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  if (!stopped) processToStop.kill('SIGKILL');
}

async function putObject(
  ticket: UploadTicket,
  bytes: Buffer,
  mimeType: string,
) {
  const headers = new Headers(ticket.requiredHeaders);
  headers.set('Content-Type', mimeType);
  return fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers,
    body: new Uint8Array(bytes),
  });
}

async function assertPutSucceeded(
  response: Response,
  label: string,
  ticket?: UploadTicket,
): Promise<void> {
  const succeeded = [200, 201].includes(response.status);
  if (!succeeded) {
    const body = await response.text();
    const errorCode =
      body.match(/<Code>\s*([^<]+)\s*<\/Code>/i)?.[1] ??
      body.match(/"Code"\s*:\s*"([^"]+)"/i)?.[1] ??
      'unknown';
    const signedHeaders = ticket
      ? (new URL(ticket.uploadUrl).searchParams.get('X-Amz-SignedHeaders') ??
        'unknown')
      : undefined;
    check(
      false,
      `${label} (HTTP ${response.status}; storage error ${errorCode}${signedHeaders ? `; signed headers ${signedHeaders}` : ''})`,
    );
    return;
  }
  check(true, label);
}

async function overwriteTestObject(
  fileId: string,
  bytes: Buffer,
  mimeType: string,
): Promise<void> {
  const key = objectKey(fileId);
  if (mockStorage) {
    mockStorage.seedObject(key, bytes, mimeType);
    return;
  }
  const endpoint =
    process.env.R2_ENDPOINT?.trim() ||
    `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  rawStorageClient ??= new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  await rawStorageClient.send(
    new PutObjectCommand({
      Bucket: process.env.R2_FILE_BUCKET!,
      Key: key,
      Body: bytes,
      ContentLength: bytes.length,
      ContentType: mimeType,
      IfNoneMatch: '*',
    }),
  );
}

async function login(alias: string): Promise<Session> {
  const user = users.get(alias);
  if (!user) throw new Error(`Fixture user ${alias} is missing.`);
  return expect<Session>(
    await request('POST', '/auth/login', undefined, {
      email: user.email,
      password: demoPassword,
    }),
    200,
    `login ${alias}`,
  );
}

async function createTicket(
  token: string,
  entityType: 'TASK' | 'COMMENT',
  entityId: string,
  originalName = 'phase05-proof.png',
  mimeType = 'image/png',
  sizeBytes = png.length,
): Promise<UploadTicket> {
  const ticket = expect<UploadTicket>(
    await request('POST', '/files/upload-url', token, {
      originalName,
      mimeType,
      sizeBytes,
      entityType,
      entityId,
    }),
    201,
    `upload ticket ${entityType}`,
  );
  uploadedIds.add(ticket.fileId);
  return ticket;
}

async function uploadAndComplete(
  ticket: UploadTicket,
  token: string,
): Promise<UploadedFile> {
  const put = await putObject(ticket, png, 'image/png');
  await assertPutSucceeded(put, 'presigned PUT must succeed.', ticket);
  return expect<UploadedFile>(
    await request('POST', '/files/complete', token, { fileId: ticket.fileId }),
    200,
    'complete upload',
  );
}

async function assertLiveCors(ticket: UploadTicket): Promise<void> {
  if (!liveR2) {
    const response = await fetch(ticket.uploadUrl, {
      method: 'OPTIONS',
      headers: {
        origin: frontendOrigin!,
        'access-control-request-method': 'PUT',
        'access-control-request-headers':
          'content-length,content-type,if-none-match',
      },
    });
    check(
      response.status === 204,
      'Local storage test server must answer CORS preflight.',
    );
    check(
      response.headers.get('access-control-allow-origin') === frontendOrigin,
      'Local storage test server must return the configured frontend origin.',
    );
    return;
  }
  const response = await fetch(ticket.uploadUrl, {
    method: 'OPTIONS',
    headers: {
      origin: frontendOrigin!,
      'access-control-request-method': 'PUT',
      'access-control-request-headers':
        'content-length,content-type,if-none-match',
    },
  });
  check(
    response.status === 200 || response.status === 204,
    'R2 bucket CORS must allow a preflighted browser PUT.',
  );
  check(
    response.headers.get('access-control-allow-origin') === frontendOrigin,
    'R2 CORS must return the exact configured frontend origin.',
  );
  const methods = response.headers.get('access-control-allow-methods') ?? '';
  const headers = response.headers.get('access-control-allow-headers') ?? '';
  check(/\bPUT\b/i.test(methods), 'R2 CORS must allow PUT.');
  check(/\bGET\b/i.test(methods), 'R2 CORS must allow GET.');
  check(/content-type/i.test(headers), 'R2 CORS must allow Content-Type.');
  check(
    /content-length/i.test(headers),
    `R2 CORS must allow Content-Length (received: ${headers || 'none'}).`,
  );
  check(/if-none-match/i.test(headers), 'R2 CORS must allow If-None-Match.');
}

async function configureCleanupContext(): Promise<void> {
  if (appContext) return;
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  appContext = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
}

async function cleanupTrackedFiles(): Promise<void> {
  if (!uploadedIds.size || cleanupCompleted) return;
  const now = new Date();
  for (const fileId of uploadedIds) {
    await prisma.$executeRaw`
      UPDATE file_links SET removed_at = COALESCE(removed_at, ${now})
      WHERE file_id = ${fileId}::uuid
    `;
    await prisma.$executeRaw`
      UPDATE file_objects
      SET status = 'REMOVED'::"FileStatus",
          removed_at = COALESCE(removed_at, ${now}),
          upload_expires_at = NULL,
          purge_after = ${now}
      WHERE id = ${fileId}::uuid
    `;
  }
  await configureCleanupContext();
  const { FilesCleanupService } = await import(
    '../src/modules/files/files-cleanup.service'
  );
  const cleanup = appContext!.get(FilesCleanupService) as {
    run: (batchSize: number) => Promise<{
      failed: number;
      purged: number;
      hasMore: boolean;
    }>;
  };
  const firstBatch = await cleanup.run(1);
  check(
    firstBatch.purged <= 1,
    'Cleanup must honor the one-object batch limit.',
  );
  check(
    firstBatch.hasMore,
    'Cleanup must report when eligible objects remain.',
  );
  const result = await cleanup.run(500);
  if (result.failed > 0) {
    throw new Error('Storage cleanup could not delete every test object.');
  }
  const remaining = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS id FROM file_objects
    WHERE id = ANY(${Array.from(uploadedIds)}::uuid[])
      AND purged_at IS NULL
  `;
  assert.equal(remaining.length, 0, 'All test objects must be purged.');
  cleanupCompleted = true;
}

async function main(): Promise<void> {
  if (!liveR2) mockStorage = await startMockStorage();
  if (!liveR2) {
    process.env.R2_ACCOUNT_ID = '00000000000000000000000000000000';
    process.env.R2_ACCESS_KEY_ID = 'phase05-test-access-key';
    process.env.R2_SECRET_ACCESS_KEY = 'phase05-test-secret-key';
    process.env.R2_FILE_BUCKET = 'phase05-check';
    process.env.R2_ENDPOINT = mockStorage!.endpoint;
  }
  await startApi();
  await prisma.$connect();

  const manager = await login('u01');
  const assignee = await login('u02');
  const outsider = await login('u03');
  const managerToken = manager.accessToken;
  const assigneeToken = assignee.accessToken;
  const outsiderToken = outsider.accessToken;

  const created = expect<{ id: string; status: string }>(
    await request('POST', '/tasks', managerToken, {
      type: 'OFFICIAL',
      title: `Phase 05 file acceptance ${new Date().toISOString()}`,
      deliverable: 'Verified R2 attachment',
      primaryAssigneeId: assignee.user.id,
      dueDate: '2030-01-15',
    }),
    201,
    'create acceptance task',
  );
  expect(
    await request('POST', `/tasks/${created.id}/publish`, managerToken),
    200,
    'publish acceptance task',
  );
  expect(
    await request('POST', `/tasks/${created.id}/start`, assigneeToken),
    200,
    'start acceptance task',
  );

  const fileCountBeforeRejectedRequests = await prisma.fileObject.count();
  expect(
    await request('POST', '/files/upload-url', outsiderToken, {
      originalName: 'denied.png',
      mimeType: 'image/png',
      sizeBytes: png.length,
      entityType: 'TASK',
      entityId: created.id,
    }),
    404,
    'foreign task upload ACL',
  );
  expect(
    await request('POST', '/files/upload-url', assigneeToken, {
      originalName: 'oversized.png',
      mimeType: 'image/png',
      sizeBytes: 20 * 1024 * 1024 + 1,
      entityType: 'TASK',
      entityId: created.id,
    }),
    400,
    '20 MB limit',
  );
  expect(
    await request('POST', '/files/upload-url', assigneeToken, {
      originalName: 'blocked.txt',
      mimeType: 'text/plain',
      sizeBytes: 10,
      entityType: 'TASK',
      entityId: created.id,
    }),
    400,
    'MIME allowlist',
  );
  check(
    (await prisma.fileObject.count()) === fileCountBeforeRejectedRequests,
    'Rejected upload requests must not create file metadata.',
  );

  const taskTicket = await createTicket(
    assigneeToken,
    'TASK',
    created.id,
    'valid.png',
  );
  const signedPut = new URL(taskTicket.uploadUrl);
  check(
    signedPut.searchParams.has('X-Amz-Signature'),
    'Upload URL must be signed.',
  );
  check(
    Number(signedPut.searchParams.get('X-Amz-Expires')) ===
      Number(process.env.R2_SIGNED_URL_TTL_SECONDS ?? 300),
    'Upload URL must use the configured short TTL.',
  );
  await assertLiveCors(taskTicket);

  if (mockStorage) mockStorage.failHeads(2);
  const firstPut = await putObject(taskTicket, png, 'image/png');
  await assertPutSucceeded(firstPut, 'presigned PUT must succeed.', taskTicket);
  if (liveR2) {
    const key = objectKey(taskTicket.fileId);
    const endpoint =
      process.env.R2_ENDPOINT?.trim() ||
      `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    const bucket = process.env.R2_FILE_BUCKET!;
    const unsignedUrls = [
      {
        kind: 'S3 endpoint',
        url: `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`,
      },
      ...(process.env.R2_PUBLIC_URL
        ? [
            {
              kind: 'configured public URL',
              url: `${process.env.R2_PUBLIC_URL.replace(/\/$/, '')}/${key}`,
            },
          ]
        : []),
    ];
    for (const unsigned of unsignedUrls) {
      const anonymous = await fetch(unsigned.url);
      await anonymous.body?.cancel();
      check(
        !anonymous.ok,
        `R2 test object must not be anonymously readable via ${unsigned.kind} (HTTP ${anonymous.status}).`,
      );
    }
  }
  const replayedPut = await putObject(taskTicket, png, 'image/png');
  check(
    replayedPut.status === 412 || replayedPut.status === 409,
    'The presigned PUT must not overwrite an object after its first use.',
  );
  if (mockStorage) mockStorage.failHeads(0);
  const completed = expect<UploadedFile>(
    await request('POST', '/files/complete', assigneeToken, {
      fileId: taskTicket.fileId,
    }),
    200,
    'complete valid upload',
  );
  check(completed.status === 'READY', 'Verified upload must become READY.');
  check(
    completed.sizeBytes === png.length,
    'Stored size must match uploaded bytes.',
  );
  const checksum = await prisma.$queryRaw<Array<{ checksum: string | null }>>`
    SELECT checksum FROM file_objects WHERE id = ${completed.id}::uuid
  `;
  check(
    checksum[0]?.checksum === createHash('sha256').update(png).digest('hex'),
    'READY metadata must store the SHA-256 of the verified bytes.',
  );
  const completedAgain = expect<UploadedFile>(
    await request('POST', '/files/complete', assigneeToken, {
      fileId: taskTicket.fileId,
    }),
    200,
    'complete idempotently',
  );
  check(
    completedAgain.id === completed.id,
    'Repeated complete returns the same file.',
  );

  const taskFiles = expect<Page<UploadedFile>>(
    await request(
      'GET',
      `/files?entityType=TASK&entityId=${created.id}`,
      managerToken,
    ),
    200,
    'list task files',
  );
  check(taskFiles.total === 1, 'Ready task file is listed.');
  check(
    !('objectKey' in taskFiles.items[0]),
    'File listing must hide objectKey.',
  );
  expect(
    await request(
      'GET',
      `/files?entityType=TASK&entityId=${created.id}`,
      outsiderToken,
    ),
    404,
    'file listing ACL before pagination',
  );

  const download = expect<{ downloadUrl: string; originalName: string }>(
    await request('GET', `/files/${completed.id}/download-url`, managerToken),
    200,
    'signed download URL',
  );
  check(
    new URL(download.downloadUrl).searchParams.has('X-Amz-Signature'),
    'Download URL must be signed.',
  );
  const downloaded = await fetch(
    download.downloadUrl,
    liveR2 ? { headers: { origin: frontendOrigin! } } : undefined,
  );
  if (liveR2) {
    check(
      downloaded.headers.get('access-control-allow-origin') === frontendOrigin,
      'R2 signed GET must return the exact configured frontend origin.',
    );
    const exposedHeaders =
      downloaded.headers.get('access-control-expose-headers') ?? '';
    check(/etag/i.test(exposedHeaders), 'R2 CORS must expose ETag.');
    check(
      /content-length/i.test(exposedHeaders),
      'R2 CORS must expose Content-Length.',
    );
  }
  check(
    downloaded.status === 200,
    'Signed download must return the stored bytes.',
  );
  check(
    Buffer.compare(Buffer.from(await downloaded.arrayBuffer()), png) === 0,
    'Downloaded bytes must equal the uploaded bytes.',
  );
  check(
    (downloaded.headers.get('content-disposition') ?? '').includes(
      'attachment',
    ),
    'Downloads must use attachment disposition.',
  );

  const comment = expect<{ id: string }>(
    await request('POST', `/tasks/${created.id}/comments`, assigneeToken, {
      body: 'Comment attachment acceptance',
    }),
    201,
    'create comment',
  );
  const commentTicket = await createTicket(
    assigneeToken,
    'COMMENT',
    comment.id,
    'comment.png',
  );
  const commentFile = await uploadAndComplete(commentTicket, assigneeToken);
  const commentFiles = expect<Page<UploadedFile>>(
    await request(
      'GET',
      `/files?entityType=COMMENT&entityId=${comment.id}`,
      assigneeToken,
    ),
    200,
    'list comment attachments',
  );
  check(
    commentFiles.total === 1 && commentFiles.items[0].id === commentFile.id,
    'Comment attachment is linked.',
  );
  const due = new Date();
  await prisma.$executeRaw`
    UPDATE file_objects
    SET status = 'REMOVED'::"FileStatus",
        removed_at = ${due},
        purge_after = ${due}
    WHERE id = ${commentFile.id}::uuid
  `;
  await configureCleanupContext();
  const { FilesCleanupService } = await import(
    '../src/modules/files/files-cleanup.service'
  );
  const { R2StorageService } = await import(
    '../src/modules/files/r2-storage.service'
  );
  const cleanupService = appContext!.get(FilesCleanupService) as {
    run: (batchSize: number) => Promise<{ failed: number }>;
  };
  await cleanupService.run(500);
  const storageService = appContext!.get(R2StorageService) as {
    headObject: (key: string) => Promise<{ sizeBytes: number } | null>;
  };
  const protectedObject = await storageService.headObject(
    objectKey(commentFile.id),
  );
  check(
    protectedObject !== null,
    'Cleanup must preserve a due object that still has an active link.',
  );

  const submitted = expect<{ submission: { id: string; fileIds: string[] } }>(
    await request('POST', `/tasks/${created.id}/submissions`, assigneeToken, {
      summary: 'Phase 05 acceptance submission',
      fileIds: [completed.id],
    }),
    201,
    'submit task attachment',
  );
  check(
    submitted.submission.fileIds.includes(completed.id),
    'Submission returns its file id.',
  );
  const stagedFiles = expect<Page<UploadedFile>>(
    await request(
      'GET',
      `/files?entityType=TASK&entityId=${created.id}`,
      managerToken,
    ),
    200,
    'task staging link after submit',
  );
  check(
    stagedFiles.total === 0,
    'Submission moves the file off the task staging link.',
  );
  const submissionFiles = expect<Page<UploadedFile>>(
    await request(
      'GET',
      `/files?entityType=SUBMISSION&entityId=${submitted.submission.id}`,
      managerToken,
    ),
    200,
    'list submission files',
  );
  check(
    submissionFiles.total === 1,
    'Submitted file is linked to the submission.',
  );
  expect(
    await request(
      'GET',
      `/files?entityType=SUBMISSION&entityId=${submitted.submission.id}`,
      outsiderToken,
    ),
    404,
    'submission file ACL',
  );

  expect(
    await request(
      'POST',
      `/tasks/${created.id}/submissions/${submitted.submission.id}/withdraw`,
      assigneeToken,
      { reason: 'Continue the acceptance workflow' },
    ),
    200,
    'withdraw submission with files',
  );
  const withdrawnFiles = expect<Page<UploadedFile>>(
    await request(
      'GET',
      `/files?entityType=SUBMISSION&entityId=${submitted.submission.id}`,
      managerToken,
    ),
    200,
    'retained withdrawn submission files',
  );
  check(
    withdrawnFiles.total === 1,
    'Withdrawn submission keeps its historical file link.',
  );

  expect(
    await request('DELETE', `/files/${completed.id}`, outsiderToken),
    404,
    'foreign removal ACL',
  );
  expect(
    await request('DELETE', `/files/${completed.id}`, managerToken),
    200,
    'leader removes a task file',
  );
  expect(
    await request('DELETE', `/files/${completed.id}`, managerToken),
    200,
    'remove idempotently',
  );
  expect(
    await request('GET', `/files/${completed.id}/download-url`, managerToken),
    404,
    'removed file cannot receive a new URL',
  );
  const removed = await prisma.$queryRaw<
    Array<{ status: string; retentionOk: boolean }>
  >`
    SELECT status::text AS status,
      purge_after >= removed_at + INTERVAL '90 days' AS "retentionOk"
    FROM file_objects WHERE id = ${completed.id}::uuid
  `;
  check(removed[0]?.status === 'REMOVED', 'Removed file is marked REMOVED.');
  check(removed[0]?.retentionOk, 'READY file retention is at least 90 days.');

  const mismatchTicket = await createTicket(
    assigneeToken,
    'TASK',
    created.id,
    'mismatch.jpg',
    'image/jpeg',
    png.length,
  );
  const mismatchPut = await putObject(mismatchTicket, png, 'image/jpeg');
  check(
    [200, 201].includes(mismatchPut.status),
    'Mismatch bytes should reach storage for verification.',
  );
  expect(
    await request('POST', '/files/complete', assigneeToken, {
      fileId: mismatchTicket.fileId,
    }),
    400,
    'actual MIME must match declaration',
  );
  const mismatched = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status::text AS status FROM file_objects
    WHERE id = ${mismatchTicket.fileId}::uuid
  `;
  check(
    mismatched[0]?.status === 'REMOVED',
    'Rejected content never becomes READY.',
  );

  const sizeMismatchTicket = await createTicket(
    assigneeToken,
    'TASK',
    created.id,
    'size-mismatch.png',
    'image/png',
    png.length - 1,
  );
  await overwriteTestObject(sizeMismatchTicket.fileId, png, 'image/png');
  expect(
    await request('POST', '/files/complete', assigneeToken, {
      fileId: sizeMismatchTicket.fileId,
    }),
    400,
    'actual object size must match declaration',
  );
  const wrongSize = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status::text AS status FROM file_objects
    WHERE id = ${sizeMismatchTicket.fileId}::uuid
  `;
  check(
    wrongSize[0]?.status === 'REMOVED',
    'Size mismatch never becomes READY.',
  );

  const interruptedTicket = await createTicket(
    assigneeToken,
    'TASK',
    created.id,
    'interrupted.png',
  );
  expect(
    await request('POST', '/files/complete', assigneeToken, {
      fileId: interruptedTicket.fileId,
    }),
    400,
    'missing interrupted object',
  );
  await prisma.$executeRaw`
    UPDATE file_objects SET upload_expires_at = ${new Date(Date.now() - 1000)}
    WHERE id = ${interruptedTicket.fileId}::uuid
  `;
  expect(
    await request('POST', '/files/complete', assigneeToken, {
      fileId: interruptedTicket.fileId,
    }),
    409,
    'expired upload metadata',
  );
  const expired = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT status::text AS status FROM file_objects
    WHERE id = ${interruptedTicket.fileId}::uuid
  `;
  check(expired[0]?.status === 'REMOVED', 'Expired upload is not READY.');

  if (mockStorage) mockStorage.failHeads(2);
  const failedStorageTicket = await createTicket(
    assigneeToken,
    'TASK',
    created.id,
    'storage-retry.png',
  );
  const storagePut = await putObject(failedStorageTicket, png, 'image/png');
  await assertPutSucceeded(
    storagePut,
    'Storage-failure case setup must upload.',
    failedStorageTicket,
  );
  if (mockStorage) {
    expect(
      await request('POST', '/files/complete', assigneeToken, {
        fileId: failedStorageTicket.fileId,
      }),
      503,
      'R2 failure must be reported',
    );
    const stillUploading = await prisma.$queryRaw<Array<{ status: string }>>`
      SELECT status::text AS status FROM file_objects
      WHERE id = ${failedStorageTicket.fileId}::uuid
    `;
    check(
      stillUploading[0]?.status === 'UPLOADING',
      'R2 outage cannot mark a file READY.',
    );
    mockStorage.failHeads(0);
    const recovered = expect<UploadedFile>(
      await request('POST', '/files/complete', assigneeToken, {
        fileId: failedStorageTicket.fileId,
      }),
      200,
      'complete again after storage recovers',
    );
    check(
      recovered.status === 'READY',
      'Retry should complete the existing upload.',
    );
  }

  await cleanupTrackedFiles();
  console.log(
    JSON.stringify({
      event: 'file_acceptance_passed',
      mode: liveR2 ? 'cloudflare-r2' : 'local-s3-compatible',
      checks: testResults,
      createdObjects: uploadedIds.size,
    }),
  );
}

void (async () => {
  let primaryError: unknown;
  try {
    await main();
  } catch (error) {
    primaryError = error;
  }
  try {
    if (uploadedIds.size && !cleanupCompleted) await cleanupTrackedFiles();
  } catch (cleanupError) {
    if (primaryError === undefined) primaryError = cleanupError;
    else {
      console.error(
        JSON.stringify({
          event: 'file_test_cleanup_failed',
          errorType:
            cleanupError instanceof Error ? cleanupError.name : 'UnknownError',
          message:
            cleanupError instanceof Error ? cleanupError.message : undefined,
        }),
      );
    }
  }
  const context = appContext as INestApplicationContext | null;
  if (context) await context.close();
  await prisma.$disconnect();
  await stopApi();
  const s3Client = rawStorageClient as S3Client | null;
  if (s3Client) s3Client.destroy();
  const storage = mockStorage as Awaited<
    ReturnType<typeof startMockStorage>
  > | null;
  if (storage) await storage.close();
  if (primaryError !== undefined) throw primaryError;
})().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      event: 'file_acceptance_failed',
      mode: liveR2 ? 'cloudflare-r2' : 'local-s3-compatible',
      errorType: error instanceof Error ? error.name : 'UnknownError',
      message: error instanceof Error ? error.message : undefined,
      trace:
        error instanceof Error
          ? error.stack?.split('\n').slice(0, 7).join('\n')
          : undefined,
    }),
  );
  process.exitCode = 1;
});
