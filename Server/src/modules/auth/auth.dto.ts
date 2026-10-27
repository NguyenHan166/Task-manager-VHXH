import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { MaxBcryptPasswordBytes } from '../../common/validation/password-byte-limit.validator';

export class LoginDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @MaxBcryptPasswordBytes()
  password!: string;
}

export class OwnProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phoneNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  avatarUrl?: string | null;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  @MaxBcryptPasswordBytes()
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @MaxBcryptPasswordBytes()
  newPassword!: string;
}

export class PageQueryDto {
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
}
