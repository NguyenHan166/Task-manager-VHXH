import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../../database/database.module';
import { FilesCleanupService } from './files-cleanup.service';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { R2StorageService } from './r2-storage.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [FilesController],
  providers: [FilesService, FilesCleanupService, R2StorageService],
  exports: [FilesCleanupService, FilesService],
})
export class FilesModule {}
