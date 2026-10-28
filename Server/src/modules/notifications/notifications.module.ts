import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { RealtimeOutboxPublisher } from './realtime-outbox.publisher';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    RealtimeOutboxPublisher,
  ],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
