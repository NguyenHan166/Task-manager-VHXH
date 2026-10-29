import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { TasksWorkflowService } from './tasks-workflow.service';
import { TaskCollaborationService } from './task-collaboration.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TasksWorkflowService, TaskCollaborationService],
})
export class TasksModule {}
