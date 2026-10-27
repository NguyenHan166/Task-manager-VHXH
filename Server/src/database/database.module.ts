import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { BusinessCodeService } from './business-code.service';

@Global()
@Module({
  providers: [PrismaService, BusinessCodeService],
  exports: [PrismaService, BusinessCodeService],
})
export class DatabaseModule {}
