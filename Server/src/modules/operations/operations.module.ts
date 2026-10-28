import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { BackupService } from './backup.service';
import { BackupStorageService } from './backup-storage.service';

@Module({
  controllers: [OperationsController],
  providers: [BackupService, BackupStorageService],
  exports: [BackupService],
})
export class OperationsModule {}
