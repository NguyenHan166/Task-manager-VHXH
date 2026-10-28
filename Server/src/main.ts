import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiEnvelopeInterceptor } from './common/http/api-envelope.interceptor';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { requestIdMiddleware } from './common/http/request-id.middleware';
import { RequestContextService } from './common/http/request-context.service';
import { OperationsMetricsService } from './modules/observability/operations-metrics.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.use(requestIdMiddleware(app.get(RequestContextService)));
  app.use(helmet());
  const allowedOrigins = process.env
    .FRONTEND_ORIGINS!.split(',')
    .map((origin) => origin.trim());
  app.enableCors({
    credentials: true,
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(null, false);
    },
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException({
          code: 'VALIDATION',
          message: 'Request validation failed',
          fieldErrors: Object.fromEntries(
            errors.map((error) => [
              error.property,
              Object.values(error.constraints ?? {}),
            ]),
          ),
        }),
    }),
  );
  app.useGlobalInterceptors(new ApiEnvelopeInterceptor());
  app.useGlobalFilters(
    new ApiExceptionFilter(app.get(OperationsMetricsService)),
  );
  await app.listen(Number(process.env.PORT), '0.0.0.0');
}

void bootstrap().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : '';
  const safeReason = reason
    .replace(/postgres(?:ql)?:\/\/[^\s'"<>]+/gi, '[redacted-database-url]')
    .replace(
      /(password|secret|token|authorization)(\s*[:=]\s*)[^\s,;]+/gi,
      '$1$2[redacted]',
    )
    .slice(0, 300);
  process.stderr.write(
    `${JSON.stringify({
      level: 'fatal',
      event: 'startup_failed',
      errorType: error instanceof Error ? error.name : 'UnknownError',
      message: reason.startsWith('Invalid backend configuration:')
        ? safeReason
        : safeReason ||
          'Startup failed; check database connection and runtime configuration',
    })}\n`,
  );
  process.exitCode = 1;
});
