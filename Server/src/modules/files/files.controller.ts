import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { CompleteFileDto, FilesQueryDto, UploadUrlDto } from './files.dto';
import { FilesService } from './files.service';

@Controller('files')
@SkipThrottle({ login: true })
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload-url')
  createUploadUrl(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: UploadUrlDto,
  ) {
    return this.files.createUploadUrl(actor, input);
  }

  @HttpCode(HttpStatus.OK)
  @Post('complete')
  complete(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: CompleteFileDto,
  ) {
    return this.files.complete(actor, input);
  }

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: FilesQueryDto) {
    return this.files.list(actor, query);
  }

  @Get(':id/download-url')
  downloadUrl(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) fileId: string,
  ) {
    return this.files.downloadUrl(actor, fileId);
  }

  @Get(':id/preview-url')
  previewUrl(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) fileId: string,
  ) {
    return this.files.previewUrl(actor, fileId);
  }

  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) fileId: string,
  ) {
    return this.files.remove(actor, fileId);
  }
}
