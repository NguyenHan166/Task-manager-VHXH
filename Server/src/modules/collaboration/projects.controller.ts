import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser, Roles } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { UserRole } from '@prisma/client';
import { CalendarQueryDto, ProjectInputDto, ProjectPatchDto } from './collaboration.dto';
import { CollaborationService } from './collaboration.service';

@Controller()
@SkipThrottle({ login: true })
export class ProjectsController {
  constructor(private readonly collaboration: CollaborationService) {}

  @Get('projects')
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.collaboration.listProjects(actor);
  }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @Post('projects')
  create(@CurrentUser() actor: AuthenticatedUser, @Body() input: ProjectInputDto) {
    return this.collaboration.createProject(actor, input);
  }

  @Get('projects/:id')
  get(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.collaboration.getProject(actor, id);
  }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @Patch('projects/:id')
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string, @Body() input: ProjectPatchDto) {
    return this.collaboration.updateProject(actor, id, input);
  }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @Delete('projects/:id')
  archive(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.collaboration.archiveProject(actor, id);
  }

  @Get('calendar')
  calendar(@CurrentUser() actor: AuthenticatedUser, @Query() query: CalendarQueryDto) {
    return this.collaboration.calendar(actor, query);
  }
}
