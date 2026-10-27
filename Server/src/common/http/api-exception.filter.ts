import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from './request-id.middleware';

type ErrorBody = {
  code?: string;
  message?: string | string[];
  fieldErrors?: Record<string, string[]>;
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;
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
      process.stderr.write(
        `${JSON.stringify({
          level: 'error',
          event: 'http_error',
          requestId: request.requestId,
          status,
          errorType:
            exception instanceof Error ? exception.name : 'UnknownError',
        })}\n`,
      );
    }
    response.status(status).json({
      error: {
        code: detail.code ?? codes[status] ?? 'INTERNAL_ERROR',
        message,
        ...(detail.fieldErrors ? { fieldErrors: detail.fieldErrors } : {}),
      },
    });
  }
}
