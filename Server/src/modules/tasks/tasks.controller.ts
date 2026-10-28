import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import {
  CommentDto,
  CreateTaskDto,
  TaskListQueryDto,
  TaskPageQueryDto,
  UpdateTaskDto,
} from './tasks.dto';
import { TasksService } from './tasks.service';

@Controller('tasks')
@SkipThrottle({ login: true })
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: TaskListQueryDto,
  ) {
    return this.tasks.list(actor, query);
  }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateTaskDto,
  ) {
    return this.tasks.create(actor, input);
  }

  @Get(':id/comments')
  comments(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Query() query: TaskPageQueryDto,
  ) {
    return this.tasks.comments(actor, taskId, query);
  }

  @Post(':id/comments')
  addComment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Body() input: CommentDto,
  ) {
    return this.tasks.addComment(actor, taskId, input);
  }

  @Get(':id/events')
  events(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Query() query: TaskPageQueryDto,
  ) {
    return this.tasks.events(actor, taskId, query);
  }

  @Get(':id')
  detail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
  ) {
    return this.tasks.detail(actor, taskId);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Body() input: UpdateTaskDto,
  ) {
    return this.tasks.update(actor, taskId, input);
  }
}
