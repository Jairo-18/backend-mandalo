import { Injectable } from '@nestjs/common';
import { ChatService } from '../services/chat.service';
import { SendChatMessageDto } from '../dtos/chat.dto';
import { User } from '../../shared/entities/user.entity';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';

@Injectable()
export class ChatUC {
  constructor(private readonly _chatService: ChatService) {}

  async threads(user: User, params: ParamsPaginationDto) {
    return await this._chatService.threads(user, params);
  }

  async thread(user: User, invoiceId: number, params: ParamsPaginationDto) {
    return await this._chatService.thread(user, invoiceId, params);
  }

  async send(user: User, invoiceId: number, dto: SendChatMessageDto) {
    return await this._chatService.send(user, invoiceId, dto);
  }

  async markRead(user: User, invoiceId: number) {
    return await this._chatService.markRead(user, invoiceId);
  }

  async unreadCount(user: User) {
    return await this._chatService.unreadCount(user);
  }
}
