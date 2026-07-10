import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UserRepository } from '../shared/repositories/user.repository';
import { OrganizationalRepository } from '../shared/repositories/organizational.repository';
import { RoleTypeCode } from '../shared/roles/roleTypeCode.enum';

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
