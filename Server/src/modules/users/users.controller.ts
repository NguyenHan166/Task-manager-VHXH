import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Body,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import { CurrentUser, Roles } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import {
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
  UserListQueryDto,
  WorkloadQueryDto,
} from './users.dto';
import { UsersService } from './users.service';

@Controller('users')
@SkipThrottle({ login: true })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: UserListQueryDto,
  ) {
    return this.users.list(actor, query);
  }

  @Roles(UserRole.MANAGER)
  @Post()
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CreateUserDto,
  ) {
    return this.users.create(input, actor.id);
  }

  @Get(':id/workload')
  workload(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) userId: string,
    @Query() query: WorkloadQueryDto,
  ) {
    return this.users.workload(actor, userId, query);
  }

  @Roles(UserRole.MANAGER)
  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) userId: string,
    @Body() input: ResetPasswordDto,
  ) {
    return this.users.resetPassword(userId, input, actor.id);
  }

  @Get(':id')
  getById(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) userId: string,
  ) {
    return this.users.getById(actor, userId);
  }

  @Roles(UserRole.MANAGER)
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) userId: string,
    @Body() input: UpdateUserDto,
  ) {
    return this.users.update(actor, userId, input);
  }
}
