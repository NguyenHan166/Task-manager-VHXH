import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import type { Request } from 'express';
import type { AuthenticatedUser } from './auth.types';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.authUser) throw new Error('Authenticated user is unavailable');
    return request.authUser;
  },
);
