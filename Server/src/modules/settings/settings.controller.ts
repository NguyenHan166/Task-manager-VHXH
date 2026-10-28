import { Body, Controller, Get, Patch } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { UpdateSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
@SkipThrottle({ login: true })
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get() {
    return this.settings.get();
  }

  @Roles(UserRole.MANAGER)
  @Patch()
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: UpdateSettingsDto,
  ) {
    return this.settings.update(input, actor.id);
  }
}
