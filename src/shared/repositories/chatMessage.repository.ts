import { ChatMessage } from '../entities/chatMessage.entity';
import { Injectable } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class ChatMessageRepository extends Repository<ChatMessage> {
  constructor(dataSource: DataSource) {
    super(ChatMessage, dataSource.createEntityManager());
  }
}
