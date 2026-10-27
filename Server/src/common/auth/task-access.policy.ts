import { Injectable } from '@nestjs/common';
import { Prisma, Task, TaskStatus, TaskType } from '@prisma/client';
import type { AuthenticatedUser } from './auth.types';

type TaskRelations = Pick<
  Task,
  'id' | 'type' | 'status' | 'createdById' | 'primaryAssigneeId'
> & {
  participants?: Array<{
    userId: string;
    invitationStatus: string;
    role: string;
  }>;
};

@Injectable()
export class TaskAccessPolicy {
  canRead(actor: AuthenticatedUser, task: TaskRelations): boolean {
    if (task.type === TaskType.PERSONAL) return task.createdById === actor.id;
    const isCreator = task.createdById === actor.id;
    const isAssignee = task.primaryAssigneeId === actor.id;
    const isAcceptedParticipant =
      task.participants?.some(
        (participant) =>
          participant.userId === actor.id &&
          participant.invitationStatus === 'ACCEPTED',
      ) ?? false;
    if (task.type === TaskType.OFFICIAL) {
      if (task.status === TaskStatus.DRAFT) return isCreator;
      if (actor.role === 'MANAGER' || actor.role === 'DEPUTY_MANAGER')
        return true;
    }
    return isCreator || isAssignee || isAcceptedParticipant;
  }

  readableTaskWhere(actor: AuthenticatedUser): Prisma.TaskWhereInput {
    const personal: Prisma.TaskWhereInput = {
      type: 'PERSONAL',
      createdById: actor.id,
    };
    const team: Prisma.TaskWhereInput = {
      type: 'TEAM',
      OR: [
        { createdById: actor.id },
        { primaryAssigneeId: actor.id },
        {
          participants: {
            some: { userId: actor.id, invitationStatus: 'ACCEPTED' },
          },
        },
      ],
    };
    const official: Prisma.TaskWhereInput =
      actor.role === 'MANAGER' || actor.role === 'DEPUTY_MANAGER'
        ? {
            OR: [
              { type: 'OFFICIAL' as const, status: { not: 'DRAFT' as const } },
              {
                type: 'OFFICIAL' as const,
                status: 'DRAFT' as const,
                createdById: actor.id,
              },
            ],
          }
        : {
            type: 'OFFICIAL' as const,
            OR: [
              {
                status: 'DRAFT' as const,
                createdById: actor.id,
              },
              {
                status: { not: 'DRAFT' as const },
                OR: [
                  { createdById: actor.id },
                  { primaryAssigneeId: actor.id },
                  {
                    participants: {
                      some: {
                        userId: actor.id,
                        invitationStatus: 'ACCEPTED',
                      },
                    },
                  },
                ],
              },
            ],
          };
    return { OR: [official, team, personal] };
  }

  canOperateOfficial(
    actor: AuthenticatedUser,
    task: Pick<Task, 'type' | 'status' | 'createdById'>,
  ): boolean {
    if (task.type !== 'OFFICIAL') return false;
    if (task.status === 'DRAFT') {
      return (
        (actor.role === 'MANAGER' || actor.role === 'DEPUTY_MANAGER') &&
        task.createdById === actor.id
      );
    }
    return actor.role === 'MANAGER' || actor.role === 'DEPUTY_MANAGER';
  }
}
