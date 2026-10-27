import 'reflect-metadata';
import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ApiEnvelopeInterceptor } from './common/http/api-envelope.interceptor';
import { ApiExceptionFilter } from './common/http/api-exception.filter';
import { requestIdMiddleware } from './common/http/request-id.middleware';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  app.setGlobalPrefix('api');
  app.use(requestIdMiddleware);
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
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(Number(process.env.PORT), '0.0.0.0');
}

void bootstrap().catch((error: unknown) => {
  const reason = error instanceof Error ? error.message : '';
  process.stderr.write(
    `${JSON.stringify({
      level: 'fatal',
      event: 'startup_failed',
      message: reason.startsWith('Invalid backend configuration:')
        ? reason
        : 'Startup failed; check database connection and runtime configuration',
    })}\n`,
  );
  process.exitCode = 1;
});
