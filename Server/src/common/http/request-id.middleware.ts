import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service';

export type RequestWithId = Request & { requestId: string };

export function requestIdMiddleware(context: RequestContextService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header('x-request-id');
    const requestId =
      incoming && /^[a-zA-Z0-9._:-]{1,128}$/.test(incoming)
        ? incoming
        : randomUUID();
    (req as RequestWithId).requestId = requestId;
    res.setHeader('x-request-id', requestId);
    const startedAt = performance.now();
    res.once('finish', () => {
      process.stdout.write(
        `${JSON.stringify({
          level: 'info',
          event: 'http_request',
          requestId,
          method: req.method,
          path: req.path,
          actorId: (req as RequestWithId).authUser?.id ?? null,
          status: res.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        })}\n`,
      );
    });
    context.run(requestId, next);
  };
}
