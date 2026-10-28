import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

type MetricsSnapshot = {
  generatedAt: string;
  uptimeSeconds: number;
  memoryBytes: { rss: number; heapUsed: number };
  cpuUsage: {
    windowMs: number;
    userMicros: number;
    systemMicros: number;
    percentOfOneCore: number;
  };
  databaseConnections: number;
  databaseConnectionLimit: number;
  counters: Record<string, number>;
  kpiQueryLatencyMs: {
    count: number;
    average: number;
    max: number;
    p95RecentWindow: number;
    recentSampleSize: number;
    recentWindowCapacity: number;
  };
  backup: {
    status: string;
    lastSuccessAt: string | null;
    retentionDays: number;
    lastRestoreDrillAt: string | null;
  };
};

type Envelope<T> = { data?: T };
type Fixture = { users: Array<{ alias: string; email: string }> };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function boundedInteger(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}.`,
    );
  }
  return parsed;
}

async function get<T>(baseUrl: URL, path: string, token: string): Promise<T> {
  const response = await fetch(new URL(path, baseUrl), {
    signal: AbortSignal.timeout(15_000),
    headers: {
      authorization: `Bearer ${token}`,
      'x-request-id': `phase07-measure-${randomUUID()}`,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as Envelope<T>;
  if (!response.ok || payload.data === undefined) {
    throw new Error(`${path} returned HTTP ${response.status}.`);
  }
  return payload.data;
}

async function localManagerToken(baseUrl: URL): Promise<string> {
  const configuredToken = process.env.PHASE07_MANAGER_ACCESS_TOKEN?.trim();
  if (configuredToken) return configuredToken;
  const fixture = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        '../docs/backend-plan/phase-00/kpi-fixture.v1.json',
      ),
      'utf8',
    ),
  ) as Fixture;
  const manager = fixture.users.find((user) => user.alias === 'u01');
  if (!manager) throw new Error('Local manager fixture user u01 is missing.');
  const response = await fetch(new URL('auth/login', baseUrl), {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: manager.email,
      password: required('DEMO_SEED_PASSWORD'),
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as Envelope<{
    accessToken?: string;
  }>;
  if (!response.ok || !payload.data?.accessToken) {
    throw new Error(
      `Local fixture manager login returned HTTP ${response.status}.`,
    );
  }
  return payload.data.accessToken;
}

function percentile(values: number[], proportion: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * proportion) - 1)] ?? 0;
}

async function main(): Promise<void> {
  const targetEnvironment = process.env.PHASE07_TARGET_ENV;
  if (targetEnvironment !== 'local' && targetEnvironment !== 'staging') {
    throw new Error('Set PHASE07_TARGET_ENV=local or staging.');
  }
  const baseUrl = new URL(required('PHASE07_API_URL'));
  const loopbackHosts = ['localhost', '127.0.0.1', '::1'];
  if (
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.search ||
    baseUrl.hash ||
    !baseUrl.pathname.replace(/\/+$/, '').endsWith('/api')
  ) {
    throw new Error('PHASE07_API_URL must be a base URL ending in /api.');
  }
  if (baseUrl.hostname !== required('PHASE07_TARGET_HOST')) {
    throw new Error('PHASE07_TARGET_HOST must exactly match the API hostname.');
  }
  if (
    targetEnvironment === 'local' &&
    (baseUrl.protocol !== 'http:' || !loopbackHosts.includes(baseUrl.hostname))
  ) {
    throw new Error('Local measurement is restricted to HTTP loopback hosts.');
  }
  if (targetEnvironment === 'staging' && baseUrl.protocol !== 'https:') {
    throw new Error('Staging measurement requires HTTPS.');
  }
  baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, '')}/`;
  const token =
    targetEnvironment === 'local'
      ? await localManagerToken(baseUrl)
      : required('PHASE07_MANAGER_ACCESS_TOKEN');
  const sampleCount = boundedInteger('PHASE07_SAMPLE_COUNT', 50, 20, 50);
  const concurrency = boundedInteger('PHASE07_CONCURRENCY', 20, 1, 50);

  const readiness = await get<{ status: string; database: string }>(
    baseUrl,
    'health/ready',
    token,
  );
  if (readiness.status !== 'ok' || readiness.database !== 'ok') {
    throw new Error('Staging readiness is not healthy.');
  }
  const before = await get<MetricsSnapshot>(
    baseUrl,
    'operations/metrics',
    token,
  );

  const durations: number[] = [];
  const httpStatuses = new Map<number, number>();
  let next = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (next < sampleCount) {
      const sample = next;
      next += 1;
      const startedAt = performance.now();
      const response = await fetch(
        new URL('dashboard/stats?scope=DEPT', baseUrl),
        {
          signal: AbortSignal.timeout(15_000),
          headers: {
            authorization: `Bearer ${token}`,
            'x-request-id': `phase07-measure-${sample}-${randomUUID()}`,
          },
        },
      );
      durations.push(performance.now() - startedAt);
      httpStatuses.set(
        response.status,
        (httpStatuses.get(response.status) ?? 0) + 1,
      );
      await response.body?.cancel();
    }
  });
  await Promise.all(workers);

  const after = await get<MetricsSnapshot>(
    baseUrl,
    'operations/metrics',
    token,
  );
  const failedRequests = [...httpStatuses.entries()]
    .filter(([status]) => status < 200 || status >= 300)
    .reduce((total, [, count]) => total + count, 0);
  process.stdout.write(
    `${JSON.stringify(
      {
        generatedAt: after.generatedAt,
        target: {
          environment: targetEnvironment,
          hostname: baseUrl.hostname,
        },
        workload: {
          endpoint: 'GET /api/dashboard/stats?scope=DEPT',
          sampleCount,
          concurrency,
          httpStatuses: Object.fromEntries([...httpStatuses.entries()].sort()),
          failedRequests,
        },
        clientLatencyMs: {
          p50: Math.round(percentile(durations, 0.5)),
          p95: Math.round(percentile(durations, 0.95)),
          max: Math.round(Math.max(...durations)),
        },
        serverMetrics: {
          uptimeSeconds: after.uptimeSeconds,
          memoryBytes: after.memoryBytes,
          cpuUsage: after.cpuUsage,
          databaseConnections: after.databaseConnections,
          databaseConnectionLimit: after.databaseConnectionLimit,
          databaseConnectionPercent:
            after.databaseConnectionLimit > 0
              ? Number(
                  (
                    (after.databaseConnections /
                      after.databaseConnectionLimit) *
                    100
                  ).toFixed(2),
                )
              : null,
          kpiQueryLatencyMs: after.kpiQueryLatencyMs,
          backup: after.backup,
          counterDelta: Object.fromEntries(
            Object.entries(after.counters ?? {}).map(([name, value]) => [
              name,
              value - (before.counters?.[name] ?? 0),
            ]),
          ),
        },
      },
      null,
      2,
    )}\n`,
  );
  if (failedRequests > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Phase 07 measurement failed'}\n`,
  );
  process.exitCode = 1;
});
