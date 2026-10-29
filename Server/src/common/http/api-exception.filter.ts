import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from './request-id.middleware';
import { OperationsMetricsService } from '../../modules/observability/operations-metrics.service';

type ErrorBody = {
  code?: string;
  message?: string | string[];
  fieldErrors?: Record<string, string | string[]>;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly metrics: OperationsMetricsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 400 && status < 500) {
      this.metrics.increment('http_4xx_errors');
    } else if (status >= 500) {
      this.metrics.increment('http_5xx_errors');
    }
    if (status >= 400 && request.path.startsWith('/api/files')) {
      this.metrics.increment('file_request_failures');
    }
    if (request.path === '/api/auth/login' && status >= 400) {
      this.metrics.increment('login_failures');
    }
    const payload =
      exception instanceof HttpException ? exception.getResponse() : null;
    const detail: ErrorBody =
      typeof payload === 'object' && payload !== null
        ? (payload as ErrorBody)
        : {};
    const codes: Record<number, string> = {
      400: 'VALIDATION',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      429: 'RATE_LIMITED',
      503: 'UNAVAILABLE',
    };
    const message =
      status >= 500
        ? status === 503
          ? 'Service temporarily unavailable'
          : 'Internal server error'
        : Array.isArray(detail.message)
          ? detail.message.join('; ')
          : (detail.message ?? 'Request failed');
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const prismaCode =
        typeof exception === 'object' && exception !== null && 'code' in exception &&
        typeof exception.code === 'string'
          ? exception.code
          : undefined;
      process.stderr.write(
        `${JSON.stringify({
          level: 'error',
          event: 'http_error',
          requestId: request.requestId,
          status,
          method: request.method,
          path: request.path,
          errorType:
            exception instanceof Error ? exception.name : 'UnknownError',
          ...(prismaCode ? { errorCode: prismaCode } : {}),
        })}\n`,
      );
    }
    const fieldErrors = detail.fieldErrors
      ? Object.fromEntries(
          Object.entries(detail.fieldErrors).map(([field, value]) => [
            field,
            Array.isArray(value) ? value.join('; ') : value,
          ]),
        )
      : undefined;
    response.status(status).json({
      error: {
        code: detail.code ?? codes[status] ?? 'INTERNAL_ERROR',
        message,
        ...(fieldErrors ? { fieldErrors } : {}),
      },
    });
  }
}
