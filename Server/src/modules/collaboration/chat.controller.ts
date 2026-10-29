import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/auth/auth.decorators';
import type { AuthenticatedUser } from '../../common/auth/auth.types';
import { ChatHistoryQueryDto, ChatMessageInputDto, ChatRoomInputDto } from './collaboration.dto';
import { ChatService } from './chat.service';

@Controller('chat')
@SkipThrottle({ login: true })
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('rooms')
  rooms(@CurrentUser() actor: AuthenticatedUser) { return this.chat.rooms(actor); }

  @Post('rooms')
  createRoom(@CurrentUser() actor: AuthenticatedUser, @Body() input: ChatRoomInputDto) { return this.chat.createRoom(actor, input); }

  @Get('rooms/:id/members')
  members(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) roomId: string) { return this.chat.members(actor, roomId); }

  @Get('rooms/:id/messages')
  messages(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) roomId: string, @Query() query: ChatHistoryQueryDto) { return this.chat.messages(actor, roomId, query); }

  @Post('rooms/:id/messages')
  send(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) roomId: string, @Body() input: ChatMessageInputDto) { return this.chat.send(actor, roomId, input); }

  @HttpCode(HttpStatus.OK)
  @Post('rooms/:id/read')
  markRead(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) roomId: string) { return this.chat.markRead(actor, roomId); }
}
