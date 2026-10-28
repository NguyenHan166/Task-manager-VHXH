import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
  AdjustTaskDto,
  DecideApprovalDto,
  ReturnSubmissionDto,
  SubmitTaskDto,
  TaskProgressDto,
  TaskReasonDto,
  UpdateTaskDto,
  WithdrawSubmissionDto,
} from './tasks.dto';
import { TasksService } from './tasks.service';
import { TasksWorkflowService } from './tasks-workflow.service';

@Controller('tasks')
@SkipThrottle({ login: true })
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly workflow: TasksWorkflowService,
  ) {}

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

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @Post(':id/publish')
  publish(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
  ) {
    return this.workflow.publish(actor, taskId);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/start')
  start(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
  ) {
    return this.workflow.start(actor, taskId);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/progress')
  progress(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Body() input: TaskProgressDto,
  ) {
    return this.workflow.progress(actor, taskId, input);
  }

  @Get(':id/submissions')
  submissions(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Query() query: TaskPageQueryDto,
  ) {
    return this.workflow.submissions(actor, taskId, query);
  }

  @Post(':id/submissions')
  submit(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Body() input: SubmitTaskDto,
  ) {
    return this.workflow.submit(actor, taskId, input);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/submissions/:submissionId/withdraw')
  withdraw(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Param('submissionId', new ParseUUIDPipe()) submissionId: string,
    @Body() input: WithdrawSubmissionDto,
  ) {
    return this.workflow.withdraw(actor, taskId, submissionId, input);
  }

  @Get(':id/approvals')
  approvals(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Query() query: TaskPageQueryDto,
  ) {
    return this.workflow.approvals(actor, taskId, query);
  }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @Post(':id/approve')
  approve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Body() input: DecideApprovalDto,
  ) {
    return this.workflow.approve(actor, taskId, input);
  }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @Post(':id/return')
  returnSubmission(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Body() input: ReturnSubmissionDto,
  ) {
    return this.workflow.returnSubmission(actor, taskId, input);
  }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @Post(':id/adjust')
  adjust(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Body() input: AdjustTaskDto,
  ) {
    return this.workflow.adjust(actor, taskId, input);
  }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @Post(':id/cancel')
  cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Body() input: TaskReasonDto,
  ) {
    return this.workflow.cancel(actor, taskId, input);
  }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @Post(':id/reopen')
  reopen(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Body() input: TaskReasonDto,
  ) {
    return this.workflow.reopen(actor, taskId, input);
  }
}
