import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SystemClockService {
  constructor(private readonly config: ConfigService) {}

  now(): Date {
    const override = this.config.get<string>('SYSTEM_CLOCK_OVERRIDE', '');
    return override ? new Date(override) : new Date();
  }
}
