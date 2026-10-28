import { Injectable } from '@nestjs/common';

type DurationSummary = { count: number; totalMs: number; maxMs: number };

@Injectable()
export class OperationsMetricsService {
  private readonly counters = new Map<string, number>();
  private readonly kpiDurationSamples: number[] = [];
  private readonly kpiSampleWindow = 512;
  private previousCpuUsage = process.cpuUsage();
  private previousCpuSampleAt = performance.now();
  private readonly kpiQueries: DurationSummary = {
    count: 0,
    totalMs: 0,
    maxMs: 0,
  };

  increment(name: string, amount = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }

  observeKpiQuery(durationMs: number): void {
    const value = Math.max(0, Math.round(durationMs));
    this.kpiQueries.count += 1;
    this.kpiQueries.totalMs += value;
    this.kpiQueries.maxMs = Math.max(this.kpiQueries.maxMs, value);
    if (this.kpiDurationSamples.length === this.kpiSampleWindow) {
      this.kpiDurationSamples.shift();
    }
    this.kpiDurationSamples.push(value);
  }

  snapshot() {
    const memory = process.memoryUsage();
    const cpuSampleAt = performance.now();
    const cpuUsage = process.cpuUsage(this.previousCpuUsage);
    const cpuWindowMs = Math.max(1, cpuSampleAt - this.previousCpuSampleAt);
    this.previousCpuUsage = process.cpuUsage();
    this.previousCpuSampleAt = cpuSampleAt;
    const sortedKpiSamples = [...this.kpiDurationSamples].sort(
      (left, right) => left - right,
    );
    const p95Index = Math.max(0, Math.ceil(sortedKpiSamples.length * 0.95) - 1);
    return {
      generatedAt: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memoryBytes: {
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        external: memory.external,
      },
      cpuUsage: {
        windowMs: Math.round(cpuWindowMs),
        userMicros: cpuUsage.user,
        systemMicros: cpuUsage.system,
        percentOfOneCore: Number(
          (
            ((cpuUsage.user + cpuUsage.system) / (cpuWindowMs * 1000)) *
            100
          ).toFixed(2),
        ),
      },
      counters: Object.fromEntries([...this.counters.entries()].sort()),
      kpiQueryLatencyMs: {
        count: this.kpiQueries.count,
        average: this.kpiQueries.count
          ? Math.round(this.kpiQueries.totalMs / this.kpiQueries.count)
          : 0,
        max: this.kpiQueries.maxMs,
        p95RecentWindow: sortedKpiSamples[p95Index] ?? 0,
        recentSampleSize: sortedKpiSamples.length,
        recentWindowCapacity: this.kpiSampleWindow,
      },
    };
  }
}
