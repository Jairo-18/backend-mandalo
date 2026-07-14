import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UserRepository } from '../shared/repositories/user.repository';
import { OrganizationalRepository } from '../shared/repositories/organizational.repository';
import { InvoiceRepository } from '../shared/repositories/invoice.repository';
import { RoleTypeCode } from '../shared/roles/roleTypeCode.enum';
import { StateTypeCode } from '../shared/constants/stateTypeCode.enum';

/** Autorización cacheada del tracking (evita ir a la DB en cada ping GPS). */
type TrackAuth = {
  invoiceId: number;
  clientUserId: string;
  organizationalId: number;
  expiresAt: number;
};

/**
 * Notificaciones en vivo de pedidos (§22 de NOTAS): solo in-app, sin push.
 * El cliente se conecta pasando su accessToken en el handshake
 * (`auth: { token }` o `?token=`); según el rol se une a rooms:
 *  - `user:{id}`     → el cliente recibe los cambios de SUS pedidos
 *  - `org:{orgId}`   → el negocio recibe los pedidos entrantes / cambios
 *  - `deliveries`    → todos los repartidores ven pedidos disponibles
 *  - `delivery:{id}` → el repartidor recibe los cambios de los que tomó
 *
 * Con UNA instancia no hace falta el adapter de Redis (se montará si algún
 * día hay 2+ instancias, ver §21).
 */
@WebSocketGateway({
  cors: { origin: '*' },
  // Namespace propio para no chocar con otros usos futuros de socket.io.
  namespace: '/orders',
})
export class InvoiceGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('InvoiceGateway');

  constructor(
    private readonly _jwtService: JwtService,
    private readonly _configService: ConfigService,
    private readonly _userRepository: UserRepository,
    private readonly _organizationalRepository: OrganizationalRepository,
    private readonly _invoiceRepository: InvoiceRepository,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);
      if (!token) throw new Error('sin token');

      const payload = this._jwtService.verify(token, {
        secret: this._configService.get<string>('jwt.secret'),
      });

      const user = await this._userRepository.findOne({
        where: { id: payload.sub },
        relations: ['roleType'],
      });
      if (!user) throw new Error('usuario no encontrado');

      // Todos escuchan sus propios pedidos (como cliente).
      client.join(`user:${user.id}`);

      const roleCode = user.roleType?.code;
      if (roleCode === RoleTypeCode.DELIVERY) {
        client.join('deliveries');
        client.join(`delivery:${user.id}`);
      } else if (roleCode === RoleTypeCode.BUSINESS) {
        const org = await this._organizationalRepository.findOne({
          where: { legalPersonId: user.id },
        });
        if (org) client.join(`org:${org.id}`);
      }

      client.data.userId = user.id;
    } catch (error) {
      // Conexión sin token válido: se rechaza en silencio.
      this.logger.warn(`Conexión rechazada: ${(error as Error).message}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(_client: Socket): void {
    // Nada que limpiar: las rooms se sueltan solas al desconectar.
  }

  // ---------- tracking en vivo del repartidor ----------

  /**
   * El repartidor reporta su posición GPS mientras lleva un pedido EN RUTA;
   * se retransmite a la sala del cliente y del negocio (`delivery:position`).
   * La autorización (es el repartidor ASIGNADO y el pedido sigue en ruta) se
   * valida contra la DB y se cachea 60 s en el socket — los pings llegan cada
   * pocos segundos y no ameritan un query cada uno.
   */
  @SubscribeMessage('delivery:position')
  async handleDeliveryPosition(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { invoiceId?: number; latitude?: number; longitude?: number },
  ): Promise<void> {
    const userId = client.data.userId as string | undefined;
    const { invoiceId, latitude, longitude } = body ?? {};
    if (
      !userId ||
      !invoiceId ||
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      return;
    }

    let auth = client.data.trackAuth as TrackAuth | undefined;
    if (
      !auth ||
      auth.invoiceId !== invoiceId ||
      auth.expiresAt < Date.now()
    ) {
      const invoice = await this._invoiceRepository.findOne({
        where: { id: invoiceId },
        relations: ['stateType'],
      });
      if (
        !invoice ||
        invoice.deliveryUserId !== userId ||
        invoice.stateType?.code !== (StateTypeCode.ON_ROUTE as string)
      ) {
        client.data.trackAuth = undefined;
        return;
      }
      auth = {
        invoiceId,
        clientUserId: invoice.userId,
        organizationalId: invoice.organizationalId,
        expiresAt: Date.now() + 60_000,
      };
      client.data.trackAuth = auth;
    }

    const payload = { invoiceId, latitude, longitude, at: Date.now() };
    this.emitToUser(auth.clientUserId, 'delivery:position', payload);
    this.emitToOrg(auth.organizationalId, 'delivery:position', payload);
  }

  /**
   * ¿Hay algún socket escuchando esta room? Lo usa el chat para mandar push
   * SOLO cuando el destinatario no está conectado (evita la doble
   * notificación con la app abierta). Con una instancia el adapter es local.
   */
  hasListeners(room: string): boolean {
    const adapter = (
      this.server as unknown as {
        adapter?: { rooms?: Map<string, Set<string>> };
      }
    ).adapter;
    return !!adapter?.rooms?.get(room)?.size;
  }

  // ---------- emisores (los usa el service) ----------

  emitToUser(userId: string, event: string, payload: unknown): void {
    this.server?.to(`user:${userId}`).emit(event, payload);
  }

  emitToOrg(organizationalId: number, event: string, payload: unknown): void {
    this.server?.to(`org:${organizationalId}`).emit(event, payload);
  }

  emitToDeliveries(event: string, payload: unknown): void {
    this.server?.to('deliveries').emit(event, payload);
  }

  emitToDelivery(deliveryUserId: string, event: string, payload: unknown): void {
    this.server?.to(`delivery:${deliveryUserId}`).emit(event, payload);
  }
}
