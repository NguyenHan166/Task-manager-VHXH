import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileStatus, Prisma, Task, TaskStatus, TaskType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { TaskAccessPolicy } from '../../common/auth/task-access.policy';
import { PrismaService } from '../../database/prisma.service';
import {
  CompleteFileDto,
  FileEntityType,
  FilesQueryDto,
  UploadUrlDto,
} from './files.dto';
import { R2StorageService } from './r2-storage.service';

const MAX_FILES_PER_ENTITY = 20;
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/gif': ['.gif'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    '.docx',
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    '.xlsx',
  ],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
    '.pptx',
  ],
};

type ResolvedTarget = {
  task: Pick<
    Task,
    'id' | 'type' | 'status' | 'createdById' | 'primaryAssigneeId'
  > | null;
  roomId?: string;
  entityType: FileEntityType.TASK | FileEntityType.COMMENT | FileEntityType.MESSAGE;
  entityId: string;
};

type FileLinkTaskId = {
  taskId: string | null;
  submissionId: string | null;
  commentId: string | null;
  messageId: string | null;
};

@Injectable()
export class FilesService {
  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(TaskAccessPolicy)
    private readonly access: TaskAccessPolicy,
    @Inject(R2StorageService)
    private readonly storage: R2StorageService,
    @Inject(ConfigService)
    private readonly config: ConfigService,
  ) {}

  async createUploadUrl(actor: AuthenticatedUser, input: UploadUrlDto) {
    const originalName = this.safeFileName(input.originalName);
    const mimeType = input.mimeType.trim().toLowerCase();
    const allowedExtensions = ALLOWED_MIME_TYPES[mimeType];
    if (!allowedExtensions) throw invalid('This file type is not allowed');
    const extension = this.fileExtension(originalName);
    if (!allowedExtensions.includes(extension)) {
      throw invalid('The filename extension does not match the declared type');
    }

    const fileId = randomUUID();
    const objectKey = `private/${fileId.slice(0, 2)}/${fileId}`;
    const now = new Date();
    const uploadExpiresAt = new Date(
      now.getTime() + this.storage.ttlSeconds() * 1000,
    );
    const result = await this.prisma.$transaction(async (tx) => {
      const target = await this.resolveWriteTarget(tx, actor, input);
      if (target.roomId) {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM chat_rooms WHERE id = ${target.roomId}::uuid FOR UPDATE`;
      } else if (target.task) {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM tasks WHERE id = ${target.task.id}::uuid FOR UPDATE`;
      }
      const lockedTarget = await this.resolveWriteTarget(tx, actor, input);
      const linkWhere = this.linkTargetWhere(lockedTarget);
      const [count, settings] = await Promise.all([
        tx.fileLink.count({
          where: {
            ...linkWhere,
            removedAt: null,
            file: { is: { status: { not: FileStatus.REMOVED } } },
          },
        }),
        tx.appSettings.findUnique({
          where: { id: 1 },
          select: { maxFileSizeMb: true },
        }),
      ]);
      if (count >= MAX_FILES_PER_ENTITY) {
        throw conflict(
          `An entity can have at most ${MAX_FILES_PER_ENTITY} active files`,
        );
      }
      const maxBytes = this.maxFileSizeBytes(settings?.maxFileSizeMb);
      if (input.sizeBytes > maxBytes) {
        throw invalid(`File size must not exceed ${maxBytes} bytes`);
      }

      const uploadUrl = await this.storage.createUploadUrl({
        objectKey,
        mimeType,
        sizeBytes: input.sizeBytes,
      });
      const inserted = await tx.$executeRaw`
        INSERT INTO file_objects (
          id, object_key, original_name, mime_type, size_bytes,
          uploaded_by_id, status, created_at, upload_expires_at
        ) VALUES (
          ${fileId}::uuid, ${objectKey}, ${originalName}, ${mimeType},
          ${BigInt(input.sizeBytes)}, ${actor.id}::uuid,
          'UPLOADING'::"FileStatus", ${now}, ${uploadExpiresAt}
        )
      `;
      if (inserted !== 1) throw conflict('Could not create upload metadata');
      const file = await tx.fileObject.findUniqueOrThrow({
        where: { id: fileId },
      });
      await tx.fileLink.create({
        data: {
          fileId,
          ...(lockedTarget.entityType === FileEntityType.TASK
            ? { taskId: lockedTarget.entityId }
            : lockedTarget.entityType === FileEntityType.COMMENT
              ? { commentId: lockedTarget.entityId }
              : { messageId: lockedTarget.entityId }),
          createdAt: now,
        },
      });
      await this.writeAudit(
        tx,
        actor.id,
        'FILE_UPLOAD_STARTED',
        file.id,
        null,
        {
          status: FileStatus.UPLOADING,
          sizeBytes: input.sizeBytes,
          mimeType,
        },
      );
      return { file, uploadUrl };
    });

    return {
      fileId: result.file.id,
      uploadUrl: result.uploadUrl,
      expiresAt: uploadExpiresAt,
      requiredHeaders: {
        'Content-Type': mimeType,
        'If-None-Match': '*',
      },
    };
  }

  async complete(actor: AuthenticatedUser, input: CompleteFileDto) {
    const file = await this.prisma.fileObject.findFirst({
      where: { id: input.fileId, uploadedById: actor.id },
    });
    if (!file) throw notFound();
    if (file.status === FileStatus.READY) {
      await this.assertFileTaskAccess(actor, file.id, false);
      return publicFile(file);
    }
    if (file.status !== FileStatus.UPLOADING) {
      throw conflict('This upload is no longer active');
    }
    await this.assertFileTaskAccess(actor, file.id, true);
    const now = new Date();
    const expiry = await this.prisma.$queryRaw<
      Array<{ uploadExpiresAt: Date | null }>
    >`
      SELECT upload_expires_at AS "uploadExpiresAt"
      FROM file_objects WHERE id = ${file.id}::uuid
    `;
    if (!expiry[0]?.uploadExpiresAt || expiry[0].uploadExpiresAt <= now) {
      const marked = await this.markUploadRemoved(
        file,
        actor.id,
        now,
        'FILE_UPLOAD_EXPIRED',
      );
      if (!marked)
        throw conflict('The upload changed while it was being verified');
      await this.storage.deleteObject(file.objectKey);
      throw conflict('The upload URL has expired');
    }

    const head = await this.storage.headObject(file.objectKey);
    if (!head) throw invalid('The uploaded object is not available yet');
    const declaredSize = Number(file.sizeBytes);
    const settings = await this.prisma.appSettings.findUnique({
      where: { id: 1 },
      select: { maxFileSizeMb: true },
    });
    const maxBytes = this.maxFileSizeBytes(settings?.maxFileSizeMb);
    if (
      head.sizeBytes !== declaredSize ||
      head.sizeBytes < 1 ||
      head.sizeBytes > maxBytes
    ) {
      await this.rejectUpload(file, actor.id, 'Uploaded size does not match');
    }

    const inspected = await this.storage.inspectObject(file.objectKey);
    if (!inspected) throw invalid('The uploaded object is not available yet');
    if (
      inspected.byteLength !== head.sizeBytes ||
      inspected.byteLength !== declaredSize
    ) {
      await this.rejectUpload(file, actor.id, 'Uploaded size does not match');
    }
    const allowedExtensions = inspected.mimeType
      ? ALLOWED_MIME_TYPES[inspected.mimeType]
      : undefined;
    if (
      !inspected.mimeType ||
      !allowedExtensions ||
      inspected.mimeType !== file.mimeType ||
      !allowedExtensions.includes(this.fileExtension(file.originalName))
    ) {
      await this.rejectUpload(
        file,
        actor.id,
        'Uploaded file content is not allowed',
      );
    }

    const saved = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.$executeRaw`
        UPDATE file_objects
        SET status = 'READY'::"FileStatus",
            mime_type = ${inspected.mimeType!},
            checksum = ${inspected.sha256},
            upload_expires_at = NULL
        WHERE id = ${file.id}::uuid
          AND uploaded_by_id = ${actor.id}::uuid
          AND status = 'UPLOADING'::"FileStatus"
          AND upload_expires_at > ${now}
          AND size_bytes = ${BigInt(declaredSize)}
      `;
      if (changed !== 1) {
        throw conflict('The upload changed while it was being verified');
      }
      const ready = await tx.fileObject.findUniqueOrThrow({
        where: { id: file.id },
      });
      await this.writeAudit(
        tx,
        actor.id,
        'FILE_UPLOAD_READY',
        file.id,
        { status: FileStatus.UPLOADING },
        {
          status: FileStatus.READY,
          sizeBytes: inspected.byteLength,
          mimeType: inspected.mimeType,
          checksumAlgorithm: 'SHA-256',
        },
      );
      return ready;
    });
    return publicFile(saved);
  }

  async list(actor: AuthenticatedUser, query: FilesQueryDto) {
    if (Boolean(query.entityType) !== Boolean(query.entityId)) {
      throw invalid('entityType and entityId must be provided together');
    }
    const scopeWhere = await this.listScopeWhere(actor, query);
    const where: Prisma.FileLinkWhereInput = {
      removedAt: null,
      file: { is: { status: FileStatus.READY } },
      ...scopeWhere,
      ...(query.search
        ? {
            file: {
              is: {
                status: FileStatus.READY,
                originalName: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            },
          }
        : {}),
    };
    return this.prisma.$transaction(
      async (tx) => {
        const [links, total] = await Promise.all([
          tx.fileLink.findMany({
            where,
            select: {
              file: {
                select: {
                  id: true,
                  originalName: true,
                  mimeType: true,
                  sizeBytes: true,
                  uploadedById: true,
                  status: true,
                  createdAt: true,
                },
              },
            },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
          }),
          tx.fileLink.count({ where }),
        ]);
        return {
          items: links.map(({ file }) => ({
            ...file,
            sizeBytes: Number(file.sizeBytes),
          })),
          total,
          page: query.page,
          pageSize: query.pageSize,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async downloadUrl(actor: AuthenticatedUser, fileId: string) {
    const file = await this.prisma.fileObject.findFirst({
      where: { id: fileId, status: FileStatus.READY },
    });
    if (!file) throw notFound();
    await this.assertFileTaskAccess(actor, file.id, false);
    const downloadUrl = await this.storage.createDownloadUrl({
      objectKey: file.objectKey,
      originalName: file.originalName,
    });
    return {
      downloadUrl,
      originalName: file.originalName,
      expiresAt: new Date(Date.now() + this.storage.ttlSeconds() * 1000),
    };
  }

  async previewUrl(actor: AuthenticatedUser, fileId: string) {
    const file = await this.prisma.fileObject.findFirst({
      where: { id: fileId, status: FileStatus.READY },
    });
    if (!file) throw notFound();
    await this.assertFileTaskAccess(actor, file.id, false);
    const previewUrl = await this.storage.createPreviewUrl({
      objectKey: file.objectKey,
      originalName: file.originalName,
      mimeType: file.mimeType,
    });
    return {
      previewUrl,
      originalName: file.originalName,
      mimeType: file.mimeType,
      expiresAt: new Date(Date.now() + this.storage.ttlSeconds() * 1000),
    };
  }

  async remove(actor: AuthenticatedUser, fileId: string) {
    const file = await this.prisma.fileObject.findUnique({
      where: { id: fileId },
    });
    if (!file) throw notFound();
    const task = await this.assertFileTaskAccess(actor, file.id, false, true);
    if (
      file.uploadedById !== actor.id &&
      (!task || !this.access.canOperateOfficial(actor, task))
    ) {
      throw forbidden(
        'Only the uploader or a task leader can remove this file',
      );
    }
    if (file.status === FileStatus.REMOVED) return { success: true };
    const now = new Date();
    const purgeAfter =
      file.status === FileStatus.UPLOADING
        ? now
        : new Date(now.getTime() + this.retentionDays() * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.$executeRaw`
        UPDATE file_objects
        SET status = 'REMOVED'::"FileStatus",
            removed_at = ${now},
            purge_after = ${purgeAfter},
            upload_expires_at = NULL
        WHERE id = ${file.id}::uuid AND status = ${file.status}::"FileStatus"
      `;
      if (changed !== 1) {
        throw conflict('The file changed while it was being removed');
      }
      await tx.fileLink.updateMany({
        where: { fileId: file.id, removedAt: null },
        data: { removedAt: now },
      });
      await this.writeAudit(
        tx,
        actor.id,
        'FILE_REMOVED',
        file.id,
        { status: file.status },
        { status: FileStatus.REMOVED, removedAt: now.toISOString() },
      );
    });
    return { success: true };
  }

  async markUploadRemoved(
    file: { id: string; objectKey: string; status: FileStatus },
    actorId: string | null,
    now: Date,
    action: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.$executeRaw`
        UPDATE file_objects
        SET status = 'REMOVED'::"FileStatus",
            removed_at = ${now},
            purge_after = ${now},
            upload_expires_at = NULL
        WHERE id = ${file.id}::uuid AND status = 'UPLOADING'::"FileStatus"
      `;
      if (changed !== 1) return false;
      await tx.fileLink.updateMany({
        where: { fileId: file.id, removedAt: null },
        data: { removedAt: now },
      });
      await this.writeAudit(
        tx,
        actorId,
        action,
        file.id,
        { status: FileStatus.UPLOADING },
        { status: FileStatus.REMOVED, removedAt: now.toISOString() },
      );
      return true;
    });
  }

  async recordPurged(
    file: { id: string; objectKey: string },
    now: Date,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.$executeRaw`
        UPDATE file_objects
        SET purged_at = ${now}
        WHERE id = ${file.id}::uuid
          AND status = 'REMOVED'::"FileStatus"
          AND purged_at IS NULL
          AND purge_after <= ${now}
          AND NOT EXISTS (
            SELECT 1 FROM file_links
            WHERE file_links.file_id = ${file.id}::uuid
              AND file_links.removed_at IS NULL
          )
      `;
      if (changed !== 1) return false;
      await this.writeAudit(
        tx,
        null,
        'FILE_OBJECT_PURGED',
        file.id,
        { purgedAt: null },
        { purgedAt: now.toISOString() },
      );
      return true;
    });
  }

  private async rejectUpload(
    file: { id: string; objectKey: string; status: FileStatus },
    actorId: string,
    reason: string,
  ): Promise<never> {
    const removed = await this.markUploadRemoved(
      file,
      actorId,
      new Date(),
      'FILE_UPLOAD_REJECTED',
    );
    if (!removed)
      throw conflict('The upload changed while it was being verified');
    await this.storage.deleteObject(file.objectKey);
    throw invalid(reason);
  }

  private async resolveWriteTarget(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    input: UploadUrlDto,
  ): Promise<ResolvedTarget> {
    if (input.entityType === FileEntityType.MESSAGE) {
      const message = await tx.chatMessage.findFirst({
        where: {
          id: input.entityId,
          deletedAt: null,
          room: { is: { members: { some: { userId: actor.id } } } },
        },
        select: { id: true, roomId: true },
      });
      if (!message) throw notFound();
      return { task: null, roomId: message.roomId, entityType: FileEntityType.MESSAGE, entityId: message.id };
    }
    if (
      input.entityType !== FileEntityType.TASK &&
      input.entityType !== FileEntityType.COMMENT
    ) {
      throw invalid('P0 uploads must target a TASK or COMMENT');
    }

    const task =
      input.entityType === FileEntityType.TASK
        ? await tx.task.findFirst({
            where: {
              id: input.entityId,
              AND: [this.access.readableTaskWhere(actor)],
            },
            select: {
              id: true,
              type: true,
              status: true,
              createdById: true,
              primaryAssigneeId: true,
            },
          })
        : null;
    const comment =
      input.entityType === FileEntityType.COMMENT
        ? await tx.taskComment.findFirst({
            where: {
              id: input.entityId,
              task: { is: { AND: [this.access.readableTaskWhere(actor)] } },
            },
            include: {
              task: {
                select: {
                  id: true,
                  type: true,
                  status: true,
                  createdById: true,
                  primaryAssigneeId: true,
                },
              },
            },
          })
        : null;
    if (input.entityType === FileEntityType.TASK && !task) throw notFound();
    if (input.entityType === FileEntityType.COMMENT && !comment)
      throw notFound();
    const targetTask = task ?? comment!.task;
    if (input.entityType === FileEntityType.TASK) {
      if (
        targetTask.status !== TaskStatus.DRAFT &&
        targetTask.status !== TaskStatus.TODO &&
        targetTask.status !== TaskStatus.IN_PROGRESS
      ) {
        throw conflict('Task files can only be uploaded before submission');
      }
      const assignedCollaborator = targetTask.type === TaskType.OFFICIAL
        ? await tx.taskParticipant.findFirst({
            where: {
              taskId: targetTask.id,
              userId: actor.id,
              role: 'COLLABORATOR',
              invitationStatus: 'ACCEPTED',
            },
            select: { id: true },
          })
        : null;
      const canWriteTask = targetTask.type === TaskType.OFFICIAL
        ? this.access.canOperateOfficial(actor, targetTask) || targetTask.primaryAssigneeId === actor.id || Boolean(assignedCollaborator)
        : targetTask.createdById === actor.id || targetTask.primaryAssigneeId === actor.id;
      if (!canWriteTask) {
        throw forbidden(
          'Only the task creator, leader or current assignee can upload files',
        );
      }
    } else {
      if (
        targetTask.status === TaskStatus.DRAFT ||
        targetTask.status === TaskStatus.DONE ||
        targetTask.status === TaskStatus.CANCELLED
      ) {
        throw conflict('Comment attachments require an active published task');
      }
      if (
        comment!.authorId !== actor.id &&
        !this.access.canOperateOfficial(actor, targetTask)
      ) {
        throw forbidden(
          'Only the comment author or a task leader can attach files',
        );
      }
    }
    return {
      task: targetTask,
      entityType: input.entityType as
        | FileEntityType.TASK
        | FileEntityType.COMMENT
        | FileEntityType.MESSAGE,
      entityId: input.entityId,
    };
  }

  private async assertFileTaskAccess(
    actor: AuthenticatedUser,
    fileId: string,
    requireUploadWrite: boolean,
    includeRemovedLinks = false,
  ): Promise<
    Pick<Task, 'id' | 'type' | 'status' | 'createdById' | 'primaryAssigneeId'>
    | null
  > {
    const links = await this.prisma.fileLink.findMany({
      where: {
        fileId,
        ...(includeRemovedLinks ? {} : { removedAt: null }),
      },
      select: { taskId: true, submissionId: true, commentId: true, messageId: true },
      take: 20,
    });
    for (const link of links) {
      if (link.messageId) {
        const message = await this.prisma.chatMessage.findFirst({
          where: { id: link.messageId, deletedAt: null, room: { is: { members: { some: { userId: actor.id } } } } },
          select: { id: true },
        });
        if (message) return null;
        continue;
      }
      const taskId = await this.taskIdForLink(this.prisma, link);
      if (!taskId) continue;
      const task = await this.prisma.task.findFirst({
        where: {
          id: taskId,
          AND: [this.access.readableTaskWhere(actor)],
        },
        select: {
          id: true,
          type: true,
          status: true,
          createdById: true,
          primaryAssigneeId: true,
        },
      });
      if (!task) continue;
      if (requireUploadWrite) {
        const commentAuthor = link.commentId
          ? await this.prisma.taskComment.findUnique({
              where: { id: link.commentId },
              select: { authorId: true },
            })
          : null;
        const assignedCollaborator = task.type === TaskType.OFFICIAL
          ? await this.prisma.taskParticipant.findFirst({
              where: {
                taskId: task.id,
                userId: actor.id,
                role: 'COLLABORATOR',
                invitationStatus: 'ACCEPTED',
              },
              select: { id: true },
            })
          : null;
        const canWrite = task.type === TaskType.OFFICIAL
          ? this.access.canOperateOfficial(actor, task) || task.primaryAssigneeId === actor.id || Boolean(assignedCollaborator) || commentAuthor?.authorId === actor.id
          : task.createdById === actor.id || task.primaryAssigneeId === actor.id || commentAuthor?.authorId === actor.id;
        if (!canWrite) {
          throw forbidden('File upload permission is no longer active');
        }
        const isCommentAttachment = Boolean(link.commentId);
        if (task.type === TaskType.OFFICIAL && (
          isCommentAttachment
            ? new Set<TaskStatus>([
                TaskStatus.DRAFT,
                TaskStatus.DONE,
                TaskStatus.CANCELLED,
              ]).has(task.status)
            : !new Set<TaskStatus>([
                TaskStatus.DRAFT,
                TaskStatus.TODO,
                TaskStatus.IN_PROGRESS,
              ]).has(task.status)
        )) {
          throw conflict('File upload permission is no longer active');
        }
        if (task.type !== TaskType.OFFICIAL && (task.status === TaskStatus.DONE || task.status === TaskStatus.CANCELLED)) throw conflict('File upload permission is no longer active');
      }
      return task;
    }
    throw notFound();
  }

  private async taskIdForLink(
    prisma: PrismaService | Prisma.TransactionClient,
    link: FileLinkTaskId,
  ): Promise<string | null> {
    if (link.taskId) return link.taskId;
    if (link.submissionId) {
      return (
        (
          await prisma.taskSubmission.findUnique({
            where: { id: link.submissionId },
            select: { taskId: true },
          })
        )?.taskId ?? null
      );
    }
    if (link.commentId) {
      return (
        (
          await prisma.taskComment.findUnique({
            where: { id: link.commentId },
            select: { taskId: true },
          })
        )?.taskId ?? null
      );
    }
    return null;
  }

  private async listScopeWhere(
    actor: AuthenticatedUser,
    query: FilesQueryDto,
  ): Promise<Prisma.FileLinkWhereInput> {
    if (query.entityType && query.entityId) {
      await this.readableTaskIdForEntity(
        this.prisma,
        actor,
        query.entityType,
        query.entityId,
      );
      if (query.entityType === FileEntityType.TASK) {
        return { taskId: query.entityId };
      }
      if (query.entityType === FileEntityType.SUBMISSION) {
        return { submissionId: query.entityId };
      }
      if (query.entityType === FileEntityType.COMMENT) {
        return { commentId: query.entityId };
      }
      if (query.entityType === FileEntityType.MESSAGE) return { messageId: query.entityId };
      throw invalid('Unsupported file entity');
    }
    const readable = this.access.readableTaskWhere(actor);
    return {
      OR: [
        { task: { is: { AND: [readable] } } },
        { submission: { is: { task: { is: { AND: [readable] } } } } },
        { comment: { is: { task: { is: { AND: [readable] } } } } },
        { message: { is: { room: { is: { members: { some: { userId: actor.id } } } } } } },
      ],
    };
  }

  private async readableTaskIdForEntity(
    prisma: PrismaService,
    actor: AuthenticatedUser,
    entityType: FileEntityType,
    entityId: string,
  ): Promise<string> {
    if (entityType === FileEntityType.MESSAGE) {
      const message = await prisma.chatMessage.findFirst({ where: { id: entityId, room: { is: { members: { some: { userId: actor.id } } } } }, select: { roomId: true } });
      if (!message) throw notFound();
      return message.roomId;
    }
    let taskId: string | null = null;
    if (entityType === FileEntityType.TASK) {
      taskId = entityId;
    } else if (entityType === FileEntityType.SUBMISSION) {
      taskId =
        (
          await prisma.taskSubmission.findUnique({
            where: { id: entityId },
            select: { taskId: true },
          })
        )?.taskId ?? null;
    } else if (entityType === FileEntityType.COMMENT) {
      taskId =
        (
          await prisma.taskComment.findUnique({
            where: { id: entityId },
            select: { taskId: true },
          })
        )?.taskId ?? null;
    }
    if (!taskId) throw notFound();
    const task = await prisma.task.findFirst({
      where: { id: taskId, AND: [this.access.readableTaskWhere(actor)] },
      select: { id: true },
    });
    if (!task) throw notFound();
    return task.id;
  }

  private linkTargetWhere(
    target: Pick<ResolvedTarget, 'entityType' | 'entityId'>,
  ): Prisma.FileLinkWhereInput {
    if (target.entityType === FileEntityType.TASK) return { taskId: target.entityId };
    if (target.entityType === FileEntityType.COMMENT) return { commentId: target.entityId };
    return { messageId: target.entityId };
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    actorId: string | null,
    action: string,
    fileId: string,
    before: Prisma.InputJsonObject | null,
    after: Prisma.InputJsonObject,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorId,
        action,
        entity: 'FILE',
        entityId: fileId,
        before: before ?? Prisma.JsonNull,
        after,
      },
    });
  }

  private maxFileSizeBytes(settingsMaxMb?: number): number {
    const configured = Number(
      this.config.get<string>('MAX_FILE_SIZE_MB') ?? 20,
    );
    const settings = settingsMaxMb ?? configured;
    return Math.min(configured, settings) * 1024 * 1024;
  }

  private retentionDays(): number {
    return Math.max(
      90,
      Number(this.config.get<string>('FILE_REMOVED_RETENTION_DAYS') ?? 90),
    );
  }

  private safeFileName(input: string): string {
    const name = Array.from(
      input.replace(/\\/g, '/').split('/').pop()!.normalize('NFC'),
    )
      .filter((character) => {
        const codePoint = character.codePointAt(0)!;
        return codePoint > 0x1f && (codePoint < 0x7f || codePoint > 0x9f);
      })
      .join('')
      .trim();
    if (!name || name === '.' || name === '..' || name.length > 255) {
      throw invalid('A valid filename is required');
    }
    return name;
  }

  private fileExtension(name: string): string {
    const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
    if (!extension || extension === name.toLowerCase()) {
      throw invalid('A filename extension is required');
    }
    return extension;
  }
}

const publicFile = (file: {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: bigint;
  uploadedById: string;
  status: FileStatus;
  createdAt: Date;
}) => ({
  id: file.id,
  originalName: file.originalName,
  mimeType: file.mimeType,
  sizeBytes: Number(file.sizeBytes),
  uploadedById: file.uploadedById,
  status: file.status,
  createdAt: file.createdAt,
});

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'NOT_FOUND', message: 'File not found' });
const invalid = (message: string): BadRequestException =>
  new BadRequestException({ code: 'VALIDATION', message });
const forbidden = (message: string): ForbiddenException =>
  new ForbiddenException({ code: 'FORBIDDEN', message });
const conflict = (message: string): ConflictException =>
  new ConflictException({ code: 'CONFLICT', message });
