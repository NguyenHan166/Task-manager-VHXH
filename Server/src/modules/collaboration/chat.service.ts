import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ChatMessageInputDto, ChatRoomInputDto, ChatHistoryQueryDto } from './collaboration.dto';
import { Prisma, UserStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { PrismaService } from '../../database/prisma.service';

const missing = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Chat room not found' });
const bad = (message: string) => new BadRequestException({ code: 'VALIDATION', message });
const forbidden = () => new ForbiddenException({ code: 'FORBIDDEN', message: 'Only active room members can access chat' });

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async rooms(actor: AuthenticatedUser) {
    const rooms = await this.prisma.chatRoom.findMany({
      where: { members: { some: { userId: actor.id } } },
      include: {
        members: { include: { user: { select: { id: true, displayName: true, role: true, avatarUrl: true } } } },
        messages: { where: { deletedAt: null }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const result = await Promise.all(rooms.map(async (room) => {
      const membership = room.members.find((member) => member.userId === actor.id)!;
      const unreadCount = await this.prisma.chatMessage.count({ where: { roomId: room.id, senderId: { not: actor.id }, deletedAt: null, createdAt: { gt: membership.lastReadAt ?? membership.joinedAt } } });
      return { ...room, unreadCount, lastMessage: room.messages[0] ?? null };
    }));
    return result;
  }

  async members(actor: AuthenticatedUser, roomId: string) {
    const room = await this.requireMember(actor.id, roomId);
    return room.members.map((member) => ({ id: member.id, roomId: member.roomId, userId: member.userId, lastReadAt: member.lastReadAt, joinedAt: member.joinedAt, user: member.user }));
  }

  async createRoom(actor: AuthenticatedUser, input: ChatRoomInputDto) {
    const memberIds = [...new Set([...input.memberIds, actor.id])].sort();
    if (input.kind === 'DIRECT' && memberIds.length !== 2) throw bad('A direct room must contain exactly two members');
    if (input.kind === 'GROUP' && memberIds.length < 2) throw bad('A group room needs at least two members');
    const active = await this.prisma.user.findMany({ where: { id: { in: memberIds }, status: UserStatus.ACTIVE }, select: { id: true } });
    if (active.length !== memberIds.length) throw bad('Chat members must be active users');
    if (input.kind === 'DIRECT') {
      const directKey = memberIds.join(':');
      const existing = await this.prisma.chatRoom.findUnique({ where: { directKey } });
      if (existing) return existing;
      try {
        return await this.createRoomRecord(input, memberIds, directKey);
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && (error.code === 'P2002' || error.code === 'P2034')) {
          const concurrent = await this.prisma.chatRoom.findUnique({ where: { directKey } });
          if (concurrent) return concurrent;
        }
        throw error;
      }
    }
    return this.createRoomRecord(input, memberIds, null);
  }

  private createRoomRecord(input: ChatRoomInputDto, memberIds: string[], directKey: string | null) {
    return this.prisma.chatRoom.create({
      data: {
        kind: input.kind,
        title: input.kind === 'GROUP' ? input.title?.trim() || null : null,
        directKey,
        members: { create: memberIds.map((userId) => ({ userId })) },
      },
      include: { members: { select: { id: true, roomId: true, userId: true, lastReadAt: true, joinedAt: true } } },
    });
  }

  async messages(actor: AuthenticatedUser, roomId: string, query: ChatHistoryQueryDto) {
    await this.requireMember(actor.id, roomId);
    const where: Prisma.ChatMessageWhereInput = {
      roomId, deletedAt: null,
      ...(query.before ? { createdAt: { lt: new Date(query.before) } } : {}),
      ...(query.after ? { createdAt: { gt: new Date(query.after) } } : {}),
      ...(query.search ? { body: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.chatMessage.findMany({ where, include: { fileLinks: { where: { removedAt: null, file: { status: 'READY' } }, include: { file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, uploadedById: true, createdAt: true, status: true } } } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.chatMessage.count({ where }),
    ]);
    return { items: items.reverse().map((message) => this.publicMessage(message)), total, page: query.page, pageSize: query.pageSize };
  }

  async send(actor: AuthenticatedUser, roomId: string, input: ChatMessageInputDto) {
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.chatRoomMember.findUnique({ where: { roomId_userId: { roomId, userId: actor.id } }, select: { id: true } });
      if (!member) throw missing();
      if (input.fileIds?.length) {
        const files = await tx.fileObject.findMany({ where: { id: { in: input.fileIds }, uploadedById: actor.id, status: 'READY' }, select: { id: true } });
        if (files.length !== input.fileIds.length) throw bad('Message attachments must be ready files uploaded by you');
        const linked = await tx.fileLink.findMany({ where: { fileId: { in: input.fileIds }, removedAt: null }, select: { fileId: true } });
        if (linked.length) throw bad('An attached file is already linked to another entity');
      }
      const message = await tx.chatMessage.create({
        data: {
          roomId, senderId: actor.id, body: input.body,
          ...(input.fileIds?.length ? { fileLinks: { create: input.fileIds.map((fileId) => ({ fileId })) } } : {}),
        },
        include: { fileLinks: { include: { file: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, uploadedById: true, createdAt: true, status: true } } } } },
      });
      const members = await tx.chatRoomMember.findMany({ where: { roomId, userId: { not: actor.id } }, select: { userId: true } });
      const eventId = message.id;
      const notifications = members.map((row) => ({
        recipientId: row.userId, chatRoomId: roomId, type: 'CHAT_MESSAGE' as const,
        title: `Tin nhắn mới từ ${actor.displayName}`, body: input.body.slice(0, 240), businessEventId: eventId,
      }));
      if (notifications.length) {
        const inserted = await tx.notification.createMany({ data: notifications, skipDuplicates: true });
        if (inserted.count) {
          const created = await tx.notification.findMany({ where: { businessEventId: eventId } });
          await tx.realtimeOutbox.createMany({ data: created.map((notification) => ({ type: 'NOTIFICATION_NEW' as const, idempotencyKey: `notification:${notification.id}`, businessEventId: eventId, recipientId: notification.recipientId, notificationId: notification.id })) , skipDuplicates: true });
        }
      }
      await tx.realtimeOutbox.create({ data: { type: 'MESSAGE_NEW', idempotencyKey: `chat-message:${message.id}`, businessEventId: message.id, messageId: message.id, chatRoomId: roomId } });
      return this.publicMessage(message);
    });
  }

  async markRead(actor: AuthenticatedUser, roomId: string) {
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const member = await tx.chatRoomMember.updateMany({ where: { roomId, userId: actor.id }, data: { lastReadAt: now } });
      if (!member.count) throw missing();
      await tx.notification.updateMany({ where: { recipientId: actor.id, chatRoomId: roomId, readAt: null }, data: { readAt: now } });
      return { roomId, readAt: now };
    });
  }

  async isMember(userId: string, roomId: string) {
    return Boolean(await this.prisma.chatRoomMember.findUnique({ where: { roomId_userId: { roomId, userId } }, select: { id: true } }));
  }

  private async requireMember(userId: string, roomId: string) {
    const room = await this.prisma.chatRoom.findFirst({
      where: { id: roomId, members: { some: { userId } } },
      include: { members: { include: { user: { select: { id: true, displayName: true, role: true, avatarUrl: true } } } } },
    });
    if (!room) throw missing();
    return room;
  }

  private publicMessage<T extends { fileLinks: Array<{ file: { sizeBytes: bigint | number } }> }>(message: T) {
    return { ...message, fileLinks: message.fileLinks.map((link) => ({ ...link, file: { ...link.file, sizeBytes: Number(link.file.sizeBytes) } })) };
  }
}
