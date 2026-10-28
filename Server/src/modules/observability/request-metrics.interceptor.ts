import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { catchError, finalize, Observable, throwError } from 'rxjs';
import { OperationsMetricsService } from './operations-metrics.service';

@Injectable()
export class RequestMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: OperationsMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = performance.now();
    let failed = false;
    return next.handle().pipe(
      catchError((error: unknown) => {
        failed = true;
        return throwError(() => error);
      }),
      finalize(() => {
        this.metrics.increment('http_requests');
        if (!failed && response.statusCode < 400) {
          this.metrics.increment('http_requests_succeeded');
        }
        const durationMs = Math.round(performance.now() - startedAt);
        if (
          request.path.startsWith('/api/dashboard/') ||
          request.path === '/api/reports/kpi'
        ) {
          this.metrics.observeKpiQuery(durationMs);
        }
      }),
    );
  }
}
