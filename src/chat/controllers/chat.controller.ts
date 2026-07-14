import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ChatUC } from '../useCases/chat.uc';
import { SendChatMessageDto } from '../dtos/chat.dto';
import { User } from '../../shared/entities/user.entity';
import { GetUser } from '../../shared/decorators/user.decorator';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';
import { UpdateRecordResponseDto } from '../../shared/dtos/response.dto';

/**
 * Chat por pedido (cliente ↔ repartidor asignado). El hilo es el invoice;
 * el alcance sale del JWT (mismo patrón que /invoice).
 */
@Controller('chat')
@ApiTags('Chat de pedidos')
@UseGuards(AuthGuard())
export class ChatController {
  constructor(private readonly _chatUC: ChatUC) {}

  /** Mis chats (cliente o repartidor), con contraparte y no-leídos. */
  @Get('threads')
  async threads(
    @GetUser() user: User,
    @Query() params: ParamsPaginationDto,
  ) {
    const data = await this._chatUC.threads(user, params);
    return { statusCode: HttpStatus.OK, ...data };
  }

  /** Total de no-leídos en todos mis hilos (badge del sidebar). */
  @Get('unread-count')
  async unreadCount(@GetUser() user: User) {
    const count = await this._chatUC.unreadCount(user);
    return { statusCode: HttpStatus.OK, data: { count } };
  }

  /** Cabecera + página de mensajes de un pedido (nuevos primero). */
  @Get(':invoiceId')
  async thread(
    @GetUser() user: User,
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Query() params: ParamsPaginationDto,
  ) {
    const data = await this._chatUC.thread(user, invoiceId, params);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post(':invoiceId/messages')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async send(
    @GetUser() user: User,
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Body() body: SendChatMessageDto,
  ) {
    const message = await this._chatUC.send(user, invoiceId, body);
    return { statusCode: HttpStatus.CREATED, data: message };
  }

  /** Marca como leídos los mensajes del otro (al abrir el chat). */
  @Patch(':invoiceId/read')
  async markRead(
    @GetUser() user: User,
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
  ): Promise<UpdateRecordResponseDto> {
    await this._chatUC.markRead(user, invoiceId);
    return { statusCode: HttpStatus.OK, message: 'Mensajes leídos' };
  }
}
