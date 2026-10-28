import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../database/prisma.service';
import type { AuditQueryDto } from '../dashboard/dashboard.dto';

const sensitiveKey =
  /(password|token|secret|cookie|signed.?url|object.?key|checksum|authorization|private.?key|database.?url|content|file.?bytes|refresh.?hash|access.?token)/i;

const redactJson = (value: Prisma.JsonValue): Prisma.JsonValue => {
  if (Array.isArray(value)) return value.map(redactJson);
  if (value && typeof value === 'object') {
    const output: Prisma.JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined && !sensitiveKey.test(key)) {
        output[key] = redactJson(item);
      }
    }
    return output;
  }
  return value;
};

const invalid = (message: string): BadRequestException =>
  new BadRequestException({ code: 'VALIDATION', message });

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query: AuditQueryDto) {
    if (actor.role !== UserRole.MANAGER) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Audit logs are available to managers only',
      });
    }
    if (
      query.fromDate &&
      query.toDate &&
      new Date(query.fromDate).getTime() > new Date(query.toDate).getTime()
    ) {
      throw invalid('fromDate must be earlier than or equal to toDate');
    }
    const createdAt = {
      ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
      ...(query.toDate ? { lte: new Date(query.toDate) } : {}),
    };
    const where: Prisma.AuditLogWhereInput = {
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.kind ? { action: query.kind } : {}),
      ...(query.entityType ? { entity: query.entityType } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
    };
    const [rows, total] = await this.prisma.$transaction(
      [
        this.prisma.auditLog.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        this.prisma.auditLog.count({ where }),
      ],
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        kind: row.action,
        entityType: row.entity,
        entityId:
          row.entityId ??
          (row.entity === 'AppSettings' ? 'workspace-settings' : 'unknown'),
        before: row.before ? redactJson(row.before) : null,
        after: row.after ? redactJson(row.after) : null,
        createdAt: row.createdAt,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }
}
