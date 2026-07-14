import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ChatMessageRepository } from '../../shared/repositories/chatMessage.repository';
import { InvoiceRepository } from '../../shared/repositories/invoice.repository';
import { ChatMessage } from '../../shared/entities/chatMessage.entity';
import { Invoice } from '../../shared/entities/invoice.entity';
import { User } from '../../shared/entities/user.entity';
import { PageMetaDto } from '../../shared/dtos/pageMeta.dto';
import {
  ParamsPaginationDto,
  ResponsePaginationDto,
} from '../../shared/dtos/pagination.dto';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';
import { StateTypeCode } from '../../shared/constants/stateTypeCode.enum';
import { PushService } from '../../shared/services/push.service';
import { InvoiceGateway } from '../../invoice/invoice.gateway';
import { SendChatMessageDto } from '../dtos/chat.dto';

/** Participante tal como lo pinta el front (cabecera y burbujas). */
type ChatParticipant = {
  id: string;
  fullName: string;
  avatarUrl: string | null;
};

/** Estados en los que el chat está ABIERTO (repartidor ya asignado). */
const ACTIVE_STATES: string[] = [
  StateTypeCode.PREPARING,
  StateTypeCode.ON_ROUTE,
];

/**
 * Chat por pedido entre el CLIENTE y el REPARTIDOR asignado. El hilo ES el
 * invoice: se abre cuando un repartidor toma el pedido, se cierra (solo
 * lectura) al entregar/cancelar. El negocio no participa; el ADMIN puede
 * leer (soporte) pero no escribir.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly _chatMessageRepository: ChatMessageRepository,
    private readonly _invoiceRepository: InvoiceRepository,
    private readonly _pushService: PushService,
    private readonly _gateway: InvoiceGateway,
  ) {}

  // ---------- hilo de un pedido ----------

  /**
   * Cabecera + página de mensajes (los más nuevos primero, para la lista
   * invertida del front). Una sola llamada deja la pantalla lista.
   */
  async thread(user: User, invoiceId: number, params: ParamsPaginationDto) {
    const invoice = await this.getInvoiceForChat(invoiceId);
    this.assertCanView(user, invoice);

    const page = params.page ?? 1;
    const perPage = params.perPage ?? 30;

    const [messages, itemCount] =
      await this._chatMessageRepository.findAndCount({
        where: { invoiceId },
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: (page - 1) * perPage,
        take: perPage,
      });

    const pagination = new PageMetaDto({
      itemCount,
      pageOptionsDto: { ...params, page, perPage },
    });

    return {
      invoiceId,
      stateCode: invoice.stateType?.code ?? null,
      active: this.isChatActive(invoice),
      client: this.toParticipant(invoice.user),
      delivery: this.toParticipant(invoice.deliveryUser),
      messages: new ResponsePaginationDto(messages, pagination),
    };
  }

  // ---------- enviar ----------

  async send(
    user: User,
    invoiceId: number,
    dto: SendChatMessageDto,
  ): Promise<ChatMessage> {
    const invoice = await this.getInvoiceForChat(invoiceId);

    // Solo los DOS participantes escriben (el admin lee, no escribe).
    const isClient = invoice.userId === user.id;
    const isDelivery = invoice.deliveryUserId === user.id;
    if (!isClient && !isDelivery) {
      throw new ForbiddenException('No participas en este chat.');
    }

    if (!invoice.deliveryUserId) {
      throw new BadRequestException(
        'El chat se habilita cuando un repartidor tome el pedido.',
      );
    }
    if (!this.isChatActive(invoice)) {
      throw new BadRequestException(
        'El chat de este pedido ya está cerrado.',
      );
    }

    const message = await this._chatMessageRepository.save(
      this._chatMessageRepository.create({
        invoiceId,
        senderUserId: user.id,
        body: dto.body,
      }),
    );

    // En vivo a las DOS puntas (el emisor también: confirma su optimista).
    const payload = { invoiceId, message };
    this._gateway.emitToUser(invoice.userId, 'chat:message', payload);
    this._gateway.emitToDelivery(
      invoice.deliveryUserId,
      'chat:message',
      payload,
    );

    // Push SOLO si el destinatario no está conectado al socket (app cerrada).
    const recipientId = isClient ? invoice.deliveryUserId : invoice.userId;
    const connected =
      this._gateway.hasListeners(`user:${recipientId}`) ||
      this._gateway.hasListeners(`delivery:${recipientId}`);
    if (!connected) {
      void this._pushService.sendToUsers([recipientId], {
        title: `💬 ${user.fullName || 'Nuevo mensaje'}`,
        body:
          dto.body.length > 120 ? `${dto.body.slice(0, 117)}…` : dto.body,
        data: { type: 'chat', invoiceId },
      });
    }

    return message;
  }

  // ---------- marcar leídos ----------

  /** Marca como leídos los mensajes DEL OTRO en este hilo. */
  async markRead(user: User, invoiceId: number): Promise<void> {
    const invoice = await this.getInvoiceForChat(invoiceId);
    this.assertCanView(user, invoice);
    await this._chatMessageRepository
      .createQueryBuilder()
      .update(ChatMessage)
      .set({ readAt: new Date() })
      .where('"invoiceId" = :invoiceId', { invoiceId })
      .andWhere('"senderUserId" != :me', { me: user.id })
      .andWhere('"readAt" IS NULL')
      .execute();
  }

  // ---------- mis chats ----------

  /**
   * Hilos del usuario (cliente o repartidor): pedidos con repartidor
   * asignado, con la contraparte, el último mensaje y los no leídos.
   * offset/limit por el orden con expresión cruda (gotcha §20 de NOTAS;
   * los joins son ManyToOne, no duplican filas).
   */
  async threads(user: User, params: ParamsPaginationDto) {
    const roleCode = user.roleType?.code;
    if (
      roleCode !== RoleTypeCode.CLIENT &&
      roleCode !== RoleTypeCode.DELIVERY
    ) {
      throw new ForbiddenException('Tu rol no tiene chats de pedidos.');
    }

    const page = params.page ?? 1;
    const perPage = params.perPage ?? 20;

    const scopeField =
      roleCode === RoleTypeCode.CLIENT
        ? 'invoice.userId'
        : 'invoice.deliveryUserId';

    const query = this._invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoin('invoice.user', 'client')
      .addSelect(['client.id', 'client.fullName', 'client.avatarUrl'])
      .leftJoin('invoice.deliveryUser', 'deliveryUser')
      .addSelect([
        'deliveryUser.id',
        'deliveryUser.fullName',
        'deliveryUser.avatarUrl',
      ])
      .leftJoinAndSelect('invoice.stateType', 'stateType')
      .addSelect(
        (sub) =>
          sub
            .select('cm.body')
            .from(ChatMessage, 'cm')
            .where('cm."invoiceId" = invoice.id')
            .orderBy('cm."createdAt"', 'DESC')
            .limit(1),
        'lastMessageBody',
      )
      .addSelect(
        (sub) =>
          sub
            .select('cm."createdAt"')
            .from(ChatMessage, 'cm')
            .where('cm."invoiceId" = invoice.id')
            .orderBy('cm."createdAt"', 'DESC')
            .limit(1),
        'lastMessageAt',
      )
      .addSelect(
        (sub) =>
          sub
            .select('COUNT(*)')
            .from(ChatMessage, 'cm')
            .where('cm."invoiceId" = invoice.id')
            .andWhere('cm."senderUserId" != :me')
            .andWhere('cm."readAt" IS NULL'),
        'unreadCount',
      )
      .where('invoice.deliveryUserId IS NOT NULL')
      .andWhere(`${scopeField} = :me`, { me: user.id })
      // Actividad más reciente primero (último mensaje o cuándo se tomó).
      // La subquery va inline: Postgres no permite usar el alias de un
      // SELECT dentro de una expresión del ORDER BY.
      .orderBy(
        `COALESCE((SELECT cm2."createdAt" FROM "chatMessage" cm2
          WHERE cm2."invoiceId" = invoice.id
          ORDER BY cm2."createdAt" DESC LIMIT 1), invoice."takenAt")`,
        'DESC',
      )
      .offset((page - 1) * perPage)
      .limit(perPage);

    const { entities, raw } = await query.getRawAndEntities();

    const itemCount = await this._invoiceRepository
      .createQueryBuilder('invoice')
      .where('invoice.deliveryUserId IS NOT NULL')
      .andWhere(`${scopeField} = :me`, { me: user.id })
      .getCount();

    const items = entities.map((invoice, index) => {
      const row = raw[index] as {
        lastMessageBody: string | null;
        lastMessageAt: Date | null;
        unreadCount: string | null;
      };
      return {
        invoiceId: invoice.id,
        stateCode: invoice.stateType?.code ?? null,
        active: this.isChatActive(invoice),
        client: this.toParticipant(invoice.user),
        delivery: this.toParticipant(invoice.deliveryUser),
        lastMessage: row.lastMessageBody
          ? { body: row.lastMessageBody, at: row.lastMessageAt }
          : null,
        unreadCount: Number(row.unreadCount ?? 0),
        takenAt: invoice.takenAt ?? null,
      };
    });

    const pagination = new PageMetaDto({
      itemCount,
      pageOptionsDto: { ...params, page, perPage },
    });
    return new ResponsePaginationDto(items, pagination);
  }

  /**
   * Total de mensajes sin leer del usuario en TODOS sus hilos (badge del
   * sidebar). Barato: un COUNT con join, sin subqueries.
   */
  async unreadCount(user: User): Promise<number> {
    const roleCode = user.roleType?.code;
    if (
      roleCode !== RoleTypeCode.CLIENT &&
      roleCode !== RoleTypeCode.DELIVERY
    ) {
      return 0;
    }
    const scope =
      roleCode === RoleTypeCode.CLIENT
        ? 'invoice."userId" = :me'
        : 'invoice."deliveryUserId" = :me';
    return this._chatMessageRepository
      .createQueryBuilder('cm')
      .innerJoin('invoice', 'invoice', 'invoice."id" = cm."invoiceId"')
      .where('cm."readAt" IS NULL')
      .andWhere('cm."senderUserId" != :me', { me: user.id })
      .andWhere(scope)
      .getCount();
  }

  // ---------- helpers ----------

  private async getInvoiceForChat(id: number): Promise<Invoice> {
    const invoice = await this._invoiceRepository.findOne({
      where: { id },
      relations: ['stateType', 'user', 'deliveryUser'],
    });
    if (!invoice) throw new NotFoundException('Pedido no encontrado');
    return invoice;
  }

  /** Cliente dueño, repartidor asignado o admin (lectura de soporte). */
  private assertCanView(user: User, invoice: Invoice): void {
    const roleCode = user.roleType?.code;
    if (roleCode === RoleTypeCode.ADMIN) return;
    if (invoice.userId === user.id) return;
    if (invoice.deliveryUserId === user.id) return;
    throw new ForbiddenException('No tienes acceso a este chat.');
  }

  private isChatActive(invoice: Invoice): boolean {
    return (
      !!invoice.deliveryUserId &&
      ACTIVE_STATES.includes(invoice.stateType?.code ?? '')
    );
  }

  private toParticipant(user?: User | null): ChatParticipant | null {
    if (!user) return null;
    return {
      id: user.id,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl ?? null,
    };
  }
}
