import { Global, Module } from '@nestjs/common';
import { SystemClockService } from './system-clock.service';

@Global()
@Module({ providers: [SystemClockService], exports: [SystemClockService] })
export class ClockModule {}
