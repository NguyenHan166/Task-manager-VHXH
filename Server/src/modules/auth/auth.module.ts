import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { TaskAccessPolicy } from '../../common/auth/task-access.policy';
import { UserAccessPolicy } from '../../common/auth/user-access.policy';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('ACCESS_TOKEN_SIGNING_KEY'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: Number(
            config.getOrThrow<string>('ACCESS_TOKEN_TTL_SECONDS'),
          ),
          issuer: 'office-workspace',
          audience: 'office-workspace-web',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, UserAccessPolicy, TaskAccessPolicy],
  exports: [
    JwtModule,
    AuthService,
    JwtAuthGuard,
    UserAccessPolicy,
    TaskAccessPolicy,
  ],
})
export class AuthModule {}
