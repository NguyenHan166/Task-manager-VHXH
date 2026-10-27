import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type BusinessCodePrefix = 'CV' | 'NH' | 'CN';

@Injectable()
export class BusinessCodeService {
  async allocate(
    tx: Prisma.TransactionClient | PrismaClient,
    prefix: BusinessCodePrefix,
    at: Date,
  ): Promise<string> {
    const year = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric',
      }).format(at),
    );
    const rows = await tx.$queryRaw<Array<{ number: number }>>`
      INSERT INTO business_code_counters (prefix, year, next_value)
      VALUES (${prefix}, ${year}, 2)
      ON CONFLICT (prefix, year)
      DO UPDATE SET next_value = business_code_counters.next_value + 1
      RETURNING next_value - 1 AS number
    `;
    return `${prefix}-${year}-${String(rows[0].number).padStart(4, '0')}`;
  }
}
