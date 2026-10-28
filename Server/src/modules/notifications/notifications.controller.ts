import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { NotificationsQueryDto } from './notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@SkipThrottle({ login: true })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: NotificationsQueryDto,
  ) {
    return this.notifications.list(actor, query);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.unreadCount(actor.id);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  readOne(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) notificationId: string,
  ) {
    return this.notifications.readOne(actor.id, notificationId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  readAll(@CurrentUser() actor: AuthenticatedUser) {
    return this.notifications.readAll(actor.id);
  }
}
