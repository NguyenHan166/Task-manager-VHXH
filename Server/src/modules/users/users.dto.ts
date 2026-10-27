import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserRole, UserStatus } from '@prisma/client';
import { MaxBcryptPasswordBytes } from '../../common/validation/password-byte-limit.validator';

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class UserListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 10;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(100)
  search?: string;
}

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsEnum(UserRole)
  role!: UserRole;

  @IsString()
  @MaxLength(120)
  jobTitle!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phoneNumber?: string;

  @ValidateIf((input: CreateUserDto) => input.initialPassword !== undefined)
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @MaxBcryptPasswordBytes()
  initialPassword?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  department?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phoneNumber?: string | null;
}

export class ResetPasswordDto {
  @ValidateIf((input: ResetPasswordDto) => input.newPassword !== undefined)
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @MaxBcryptPasswordBytes()
  newPassword?: string;
}

export class WorkloadQueryDto {
  @IsOptional()
  @IsDateString()
  @Matches(/Z$/)
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  @Matches(/Z$/)
  toDate?: string;
}
