import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser, Public } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { AuthService, type AuthResult } from './auth.service';
import { ChangePasswordDto, LoginDto, OwnProfileDto } from './auth.dto';

@Controller('auth')
@SkipThrottle({ login: true })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @SkipThrottle({ login: false })
  @Throttle({
    login: {
      limit: () => Number(process.env.LOGIN_RATE_LIMIT_PER_MINUTE),
      ttl: 60_000,
    },
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Omit<AuthResult, 'refreshToken'>> {
    const result = await this.auth.login(
      input.email,
      input.password,
      request.header('user-agent'),
    );
    this.setRefreshCookie(response, result.refreshToken);
    return {
      accessToken: result.accessToken,
      expiresInSeconds: result.expiresInSeconds,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Omit<AuthResult, 'refreshToken'>> {
    try {
      const refreshToken = this.readRefreshCookie(request.header('cookie'));
      const result = await this.auth.refresh(refreshToken);
      this.setRefreshCookie(response, result.refreshToken);
      return {
        accessToken: result.accessToken,
        expiresInSeconds: result.expiresInSeconds,
        user: result.user,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException)
        this.clearRefreshCookie(response);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    await this.auth.logout(user);
    this.clearRefreshCookie(response);
    return { success: true };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    await this.auth.logoutAll(user.id);
    this.clearRefreshCookie(response);
    return { success: true };
  }

  @Get('me')
  me(
    @CurrentUser() user: AuthenticatedUser,
  ): Omit<AuthenticatedUser, 'sessionId'> {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      status: user.status,
      jobTitle: user.jobTitle,
      department: user.department,
      phoneNumber: user.phoneNumber,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  @Patch('me')
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: OwnProfileDto,
  ) {
    return this.auth.updateOwnProfile(user.id, input);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ success: true }> {
    await this.auth.changePassword(user.id, input);
    this.clearRefreshCookie(response);
    return { success: true };
  }

  private readRefreshCookie(header: string | undefined): string {
    const value = header
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('refreshToken='))
      ?.slice('refreshToken='.length);
    if (!value) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired session',
      });
    }
    return value;
  }

  private setRefreshCookie(response: Response, token: string): void {
    const days = Number(
      this.config.getOrThrow<string>('REFRESH_TOKEN_TTL_DAYS'),
    );
    const sameSite = this.config.getOrThrow<string>('REFRESH_COOKIE_SAME_SITE');
    const secure =
      this.config.getOrThrow<string>('REFRESH_COOKIE_SECURE') === 'true';
    const options = [
      'Path=/api/auth',
      'HttpOnly',
      `SameSite=${sameSite}`,
      `Max-Age=${days * 24 * 60 * 60}`,
    ];
    if (secure) options.push('Secure');
    response.append(
      'Set-Cookie',
      `refreshToken=${token}; ${options.join('; ')}`,
    );
  }

  private clearRefreshCookie(response: Response): void {
    const sameSite = this.config.getOrThrow<string>('REFRESH_COOKIE_SAME_SITE');
    const secure =
      this.config.getOrThrow<string>('REFRESH_COOKIE_SECURE') === 'true';
    const options = [
      'Path=/api/auth',
      'HttpOnly',
      `SameSite=${sameSite}`,
      'Max-Age=0',
    ];
    if (secure) options.push('Secure');
    response.append(
      'Set-Cookie',
      `refreshToken=; ${options.join('; ')}; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    );
  }
}
