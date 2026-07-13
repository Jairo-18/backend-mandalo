import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { In } from 'typeorm';
import { UserPushTokenRepository } from '../repositories/userPushToken.repository';
import { RoleTypeCode } from '../roles/roleTypeCode.enum';

export interface PushNotification {
  title: string;
  body: string;
  /** Viaja al tap de la notificación (el front navega con esto). */
  data?: Record<string, unknown>;
}

/**
 * Notificaciones push vía el servicio de Expo (exp.host). El backend NO habla
 * con FCM directamente: manda el mensaje a Expo con el ExponentPushToken del
 * dispositivo y Expo lo entrega por FCM/APNs.
 *
 * Los envíos son fire-and-forget: un push caído JAMÁS debe tumbar la
 * operación que lo disparó (crear pedido, cambiar estado) — por eso todos los
 * métodos capturan y solo loguean. Tokens muertos (DeviceNotRegistered) se
 * borran solos.
 */
@Injectable()
export class PushService {
  private readonly expo = new Expo();
  private readonly logger = new Logger('PushService');

  constructor(
    private readonly _pushTokenRepository: UserPushTokenRepository,
  ) {}

  // ---------- registro de dispositivos ----------

  async register(userId: string, token: string): Promise<void> {
    if (!Expo.isExpoPushToken(token)) {
      throw new BadRequestException('El token de notificaciones no es válido');
    }
    const existing = await this._pushTokenRepository.findOne({
      where: { token },
    });
    if (existing) {
      // Mismo teléfono, otra cuenta: el token pasa al usuario actual.
      if (existing.userId !== userId) {
        existing.userId = userId;
        await this._pushTokenRepository.save(existing);
      }
      return;
    }
    await this._pushTokenRepository.save(
      this._pushTokenRepository.create({ userId, token }),
    );
  }

  async unregister(userId: string, token: string): Promise<void> {
    await this._pushTokenRepository.delete({ userId, token });
  }

  // ---------- envíos ----------

  /** Push a todos los dispositivos de los usuarios dados. */
  async sendToUsers(
    userIds: (string | null | undefined)[],
    notification: PushNotification,
  ): Promise<void> {
    const ids = [...new Set(userIds.filter((id): id is string => !!id))];
    if (!ids.length) return;
    try {
      const tokens = await this._pushTokenRepository.find({
        where: { userId: In(ids) },
      });
      await this.deliver(
        tokens.map((t) => t.token),
        notification,
      );
    } catch (error) {
      this.logger.warn(`Push a usuarios falló: ${(error as Error).message}`);
    }
  }

  /**
   * Push a todos los REPARTIDORES activos (pedido disponible para tomar).
   * A escala Putumayo es un broadcast razonable; si algún día son cientos,
   * filtrar por cercanía antes de enviar.
   */
  async sendToActiveDeliveries(notification: PushNotification): Promise<void> {
    try {
      const tokens = await this._pushTokenRepository
        .createQueryBuilder('pushToken')
        .innerJoin('user', 'u', 'u."id" = pushToken."userId"')
        .innerJoin(
          'roleType',
          'rt',
          'rt."id" = u."roleTypeId" AND rt."code" = :code',
          { code: RoleTypeCode.DELIVERY },
        )
        .where('u."isActive" = true AND u."isBanned" = false')
        .getMany();
      await this.deliver(
        tokens.map((t) => t.token),
        notification,
      );
    } catch (error) {
      this.logger.warn(
        `Push a repartidores falló: ${(error as Error).message}`,
      );
    }
  }

  // ---------- helpers ----------

  private async deliver(
    tokens: string[],
    notification: PushNotification,
  ): Promise<void> {
    const valid = tokens.filter((t) => Expo.isExpoPushToken(t));
    if (!valid.length) return;

    const messages: ExpoPushMessage[] = valid.map((to) => ({
      to,
      sound: 'default',
      title: notification.title,
      body: notification.body,
      data: notification.data,
      priority: 'high',
      channelId: 'orders',
    }));

    for (const chunk of this.expo.chunkPushNotifications(messages)) {
      try {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        await this.cleanDeadTokens(chunk, tickets);
      } catch (error) {
        this.logger.warn(`Chunk de push falló: ${(error as Error).message}`);
      }
    }
  }

  /** Borra los tokens que Expo reporta como desinstalados/revocados. */
  private async cleanDeadTokens(
    chunk: ExpoPushMessage[],
    tickets: ExpoPushTicket[],
  ): Promise<void> {
    const dead: string[] = [];
    tickets.forEach((ticket, index) => {
      if (
        ticket.status === 'error' &&
        ticket.details?.error === 'DeviceNotRegistered'
      ) {
        const to = chunk[index]?.to;
        if (typeof to === 'string') dead.push(to);
      }
    });
    if (dead.length) {
      await this._pushTokenRepository.delete({ token: In(dead) });
      this.logger.log(`Tokens push muertos eliminados: ${dead.length}`);
    }
  }
}
