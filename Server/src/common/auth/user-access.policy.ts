import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedUser } from './auth.types';

@Injectable()
export class UserAccessPolicy {
  canManageUsers(actor: AuthenticatedUser): boolean {
    return actor.role === 'MANAGER';
  }

  canReadAdminUser(actor: AuthenticatedUser): boolean {
    return actor.role === 'MANAGER';
  }

  assertCanReadWorkload(actor: AuthenticatedUser, targetUserId: string): void {
    if (actor.role !== 'STAFF' || actor.id === targetUserId) return;
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'You can only view your own workload',
    });
  }

  assertVisibleUser(
    actor: AuthenticatedUser,
    target: { id: string; status: string } | null,
  ): asserts target is { id: string; status: string } {
    if (!target)
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'User not found',
      });
    if (actor.role === 'MANAGER' || target.status === 'ACTIVE') return;
    throw new NotFoundException({
      code: 'NOT_FOUND',
      message: 'User not found',
    });
  }
}
