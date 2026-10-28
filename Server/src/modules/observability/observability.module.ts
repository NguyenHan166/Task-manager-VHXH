import { Global, Module } from '@nestjs/common';
import { RequestContextService } from '../../common/http/request-context.service';
import { OperationsMetricsService } from './operations-metrics.service';

@Global()
@Module({
  providers: [OperationsMetricsService, RequestContextService],
  exports: [OperationsMetricsService, RequestContextService],
})
export class ObservabilityModule {}
