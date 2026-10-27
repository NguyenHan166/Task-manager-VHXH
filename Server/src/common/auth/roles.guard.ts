import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './auth.decorators';
import type { AuthenticatedUser } from './auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AuthenticatedUser['role'][]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles?.length) return true;
    const request = context
      .switchToHttp()
      .getRequest<{ authUser?: AuthenticatedUser }>();
    if (request.authUser && roles.includes(request.authUser.role)) return true;
    throw new ForbiddenException({
      code: 'FORBIDDEN',
      message: 'This action is not allowed for your role',
    });
  }
}
