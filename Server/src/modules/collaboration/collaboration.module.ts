import { Module } from '@nestjs/common';
import { CollaborationService } from './collaboration.service';
import { ProjectsController } from './projects.controller';
import { RecurrenceController } from './recurrence.controller';
import { RecurrenceService } from './recurrence.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({ controllers: [ProjectsController, RecurrenceController, ChatController], providers: [CollaborationService, RecurrenceService, ChatService] })
export class CollaborationModule {}
