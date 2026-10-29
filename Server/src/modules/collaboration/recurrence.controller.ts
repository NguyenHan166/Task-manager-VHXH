import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { RecurrenceRuleInputDto, RecurrenceRulePatchDto, ToggleRecurrenceDto } from './collaboration.dto';
import { RecurrenceService } from './recurrence.service';

@Controller()
@SkipThrottle({ login: true })
export class RecurrenceController {
  constructor(private readonly recurrence: RecurrenceService) {}

  @Get('recurrence-rules')
  rules(@CurrentUser() actor: AuthenticatedUser) { return this.recurrence.listRules(actor); }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @Post('recurrence-rules')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() input: RecurrenceRuleInputDto) { return this.recurrence.createRule(actor, input); }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @Patch('recurrence-rules/:id')
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: RecurrenceRulePatchDto) { return this.recurrence.updateRule(actor, id, input); }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @Delete('recurrence-rules/:id')
  delete(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) { return this.recurrence.deleteRule(actor, id); }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @Post('recurrence-rules/:id/toggle')
  toggle(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: ToggleRecurrenceDto) { return this.recurrence.toggleRule(actor, id, input.active); }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @Post('recurrence-rules/:id/generate')
  generate(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) { return this.recurrence.generate(actor, id); }

  @Get('recurrence-instances')
  instances(@CurrentUser() actor: AuthenticatedUser) { return this.recurrence.listInstances(actor); }
}
