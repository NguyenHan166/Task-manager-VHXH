import {
  Body,
  Controller,
  Delete,
  Get,
  applyDecorators,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import {
  CommentDto,
  ConvertTeamTaskDto,
  CreateAssignmentDto,
  CreateTaskDto,
  CreateSubtaskDto,
  TaskListQueryDto,
  TaskParticipantsQueryDto,
  TaskPageQueryDto,
  AdjustTaskDto,
  DecideApprovalDto,
  ReturnSubmissionDto,
  SubmitTaskDto,
  TaskProgressDto,
  TaskReasonDto,
  TransferTaskDto,
  TeamInvitationResponseDto,
  UpdateTaskDto,
  WithdrawSubmissionDto,
} from './tasks.dto';
import { TasksService } from './tasks.service';
import { TasksWorkflowService } from './tasks-workflow.service';
import { TaskCollaborationService } from './task-collaboration.service';
import { AssigneeRequestInputDto, DeadlineRequestInputDto, RequestDecisionDto } from '../collaboration/collaboration.dto';

const ReadThrottle = () =>
  applyDecorators(
    SkipThrottle({ default: true, login: true }),
    Throttle({ read: { limit: 300, ttl: 60_000 } }),
  );

@Controller('tasks')
@SkipThrottle({ login: true })
export class TasksController {
  constructor(
    private readonly tasks: TasksService,
    private readonly workflow: TasksWorkflowService,
    private readonly collaboration: TaskCollaborationService,
  ) {}

  @Get()
  @ReadThrottle()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: TaskListQueryDto,
  ) {
    return this.tasks.list(actor, query);
  }

  @Get('participants')
  @ReadThrottle()
  participants(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: TaskParticipantsQueryDto,
  ) {
    return this.tasks.participants(actor, query.taskIds);
  }

  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateTaskDto,
  ) {
    return input.type === 'OFFICIAL'
      ? this.tasks.create(actor, input)
      : this.collaboration.create(actor, input);
  }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @Post('assign')
  assign(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateAssignmentDto,
  ) {
    return this.tasks.createAssignment(actor, input);
  }

  @Get('invitations')
  @ReadThrottle()
  pendingInvitations(@CurrentUser() actor: AuthenticatedUser) {
    return this.collaboration.pendingInvitations(actor);
  }

  @HttpCode(HttpStatus.OK)
  @Post('invitations/:participantId/respond')
  respondInvitationById(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('participantId', new ParseUUIDPipe()) participantId: string,
    @Body() input: TeamInvitationResponseDto,
  ) { return this.collaboration.respondInvitationById(actor, participantId, input.status); }

  @Get(':id/comments')
  @ReadThrottle()
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
  @ReadThrottle()
  events(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Query() query: TaskPageQueryDto,
  ) {
    return this.tasks.events(actor, taskId, query);
  }

  @Get(':id')
  @ReadThrottle()
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
    return this.collaboration.update(actor, taskId, input).then((result) => result ?? this.tasks.update(actor, taskId, input));
  }

  @Delete(':id')
  delete(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) taskId: string) {
    return this.collaboration.deletePersonal(actor, taskId);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/invitations/:participantId/respond')
  respondInvitation(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Param('participantId', new ParseUUIDPipe()) participantId: string,
    @Body() input: TeamInvitationResponseDto,
  ) { return this.collaboration.respondInvitation(actor, taskId, participantId, input.status); }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @Post(':id/convert-official')
  convertTeam(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) taskId: string, @Body() input: ConvertTeamTaskDto) {
    return this.collaboration.convertTeam(actor, taskId, input);
  }

  @Post(':id/subtasks')
  createSubtask(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) taskId: string, @Body() input: CreateSubtaskDto) {
    return this.collaboration.createSubtask(actor, taskId, input);
  }

  @Post(':id/deadline-requests')
  createDeadlineRequest(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) taskId: string, @Body() input: DeadlineRequestInputDto) {
    return this.collaboration.createDeadlineRequest(actor, taskId, input);
  }

  @Get(':id/deadline-requests')
  @ReadThrottle()
  deadlineRequests(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) taskId: string) { return this.collaboration.deadlineRequests(actor, taskId); }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @Post(':id/deadline-requests/:requestId/decision')
  decideDeadline(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) taskId: string, @Param('requestId', new ParseUUIDPipe()) requestId: string, @Body() input: RequestDecisionDto) {
    return this.collaboration.decideDeadline(actor, taskId, requestId, input);
  }

  @Post(':id/assignee-requests')
  createAssigneeRequest(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) taskId: string, @Body() input: AssigneeRequestInputDto) {
    return this.collaboration.createAssigneeRequest(actor, taskId, input);
  }

  @Roles(UserRole.STAFF)
  @HttpCode(HttpStatus.OK)
  @Post(':id/transfer')
  transfer(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) taskId: string, @Body() input: TransferTaskDto) {
    return this.collaboration.transfer(actor, taskId, input);
  }

  @Get(':id/assignee-requests')
  @ReadThrottle()
  assigneeRequests(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) taskId: string) { return this.collaboration.assigneeRequests(actor, taskId); }

  @Roles(UserRole.MANAGER, UserRole.DEPUTY_MANAGER)
  @HttpCode(HttpStatus.OK)
  @Post(':id/assignee-requests/:requestId/decision')
  decideAssignee(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) taskId: string, @Param('requestId', new ParseUUIDPipe()) requestId: string, @Body() input: RequestDecisionDto) {
    return this.collaboration.decideAssignee(actor, taskId, requestId, input);
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
    return this.collaboration.isP1Task(taskId).then((p1) => p1 ? this.collaboration.start(actor, taskId) : this.workflow.start(actor, taskId));
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/progress')
  progress(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Body() input: TaskProgressDto,
  ) {
    return this.collaboration.isP1Task(taskId).then((p1) => p1 ? this.collaboration.progress(actor, taskId, input) : this.workflow.progress(actor, taskId, input));
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/complete')
  complete(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) taskId: string) {
    return this.collaboration.complete(actor, taskId);
  }

  @Get(':id/submissions')
  @ReadThrottle()
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
  @ReadThrottle()
  approvals(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Query() query: TaskPageQueryDto,
  ) {
    return this.workflow.approvals(actor, taskId, query);
  }

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
  ) {
    return this.workflow.cancel(actor, taskId);
  }

  @Roles(UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @Post(':id/recall')
  recall(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
  ) {
    return this.workflow.recall(actor, taskId);
  }

  @Roles(UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @Post(':id/archive')
  archiveCompleted(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
  ) {
    return this.workflow.archiveCompleted(actor, taskId);
  }

  @Roles(UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  @Post(':id/finish')
  finish(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
  ) {
    return this.workflow.finish(actor, taskId);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':id/reopen')
  reopen(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) taskId: string,
    @Body() input: TaskReasonDto,
  ) {
    return this.collaboration.isP1Task(taskId).then((p1) => p1 ? this.collaboration.reopen(actor, taskId, input) : this.workflow.reopen(actor, taskId, input));
  }
}
