import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ChatController } from './controllers/chat.controller';
import { ChatService } from './services/chat.service';
import { ChatUC } from './useCases/chat.uc';
import { InvoiceModule } from '../invoice/invoice.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // Reusa el gateway del socket /orders para los mensajes en vivo.
    InvoiceModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatUC],
  exports: [ChatService],
})
export class ChatModule {}
