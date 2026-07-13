import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource, In } from 'typeorm';
import { InvoiceRepository } from '../../shared/repositories/invoice.repository';
import { ProductRepository } from '../../shared/repositories/product.repository';
import { OrganizationalRepository } from '../../shared/repositories/organizational.repository';
import { UserAddressRepository } from '../../shared/repositories/userAddress.repository';
import { StateTypeRepository } from '../../shared/repositories/stateType.repository';
import { PaidTypeRepository } from '../../shared/repositories/paidType.repository';
import { Invoice } from '../../shared/entities/invoice.entity';
import { InvoiceDetail } from '../../shared/entities/invoiceDetail.entity';
import { User } from '../../shared/entities/user.entity';
import { StateType } from '../../shared/entities/stateType.entity';
import { PageMetaDto } from '../../shared/dtos/pageMeta.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';
import { StateTypeCode } from '../../shared/constants/stateTypeCode.enum';
import { isBusinessOpen } from '../../shared/utils/business-hours.util';
import { PushService } from '../../shared/services/push.service';
import {
  CreateInvoiceDto,
  PaginatedInvoicesParamsDto,
  UpdateInvoiceStateDto,
} from '../dtos/invoice.dto';
import { InvoiceGateway } from '../invoice.gateway';

/**
 * Transiciones permitidas del pedido: de qué estado, a qué estado y qué rol
 * puede hacerlo. El repartidor además solo mueve pedidos que TOMÓ (se valida
 * aparte). Ver el flujo en §22 de NOTAS.
 */
const TRANSITIONS: Record<string, { to: StateTypeCode; roles: RoleTypeCode[] }[]> =
  {
    [StateTypeCode.PENDING]: [
      { to: StateTypeCode.ACCEPTED, roles: [RoleTypeCode.BUSINESS] },
      {
        to: StateTypeCode.CANCELLED,
        roles: [RoleTypeCode.BUSINESS, RoleTypeCode.CLIENT],
      },
    ],
    [StateTypeCode.ACCEPTED]: [
      { to: StateTypeCode.PREPARING, roles: [RoleTypeCode.BUSINESS] },
      { to: StateTypeCode.CANCELLED, roles: [RoleTypeCode.BUSINESS] },
    ],
    [StateTypeCode.PREPARING]: [
      // El negocio despacha (confirma que el pedido salió con el repartidor).
      { to: StateTypeCode.ON_ROUTE, roles: [RoleTypeCode.BUSINESS] },
      { to: StateTypeCode.CANCELLED, roles: [RoleTypeCode.BUSINESS] },
    ],
    [StateTypeCode.ON_ROUTE]: [
      { to: StateTypeCode.DELIVERED, roles: [RoleTypeCode.DELIVERY] },
    ],
    [StateTypeCode.DELIVERED]: [],
    [StateTypeCode.CANCELLED]: [],
  };

@Injectable()
export class InvoiceService {
  constructor(
    private readonly _invoiceRepository: InvoiceRepository,
    private readonly _productRepository: ProductRepository,
    private readonly _organizationalRepository: OrganizationalRepository,
    private readonly _userAddressRepository: UserAddressRepository,
    private readonly _stateTypeRepository: StateTypeRepository,
    private readonly _paidTypeRepository: PaidTypeRepository,
    private readonly _configService: ConfigService,
    private readonly _dataSource: DataSource,
    private readonly _gateway: InvoiceGateway,
    private readonly _pushService: PushService,
  ) {}

  /** Tarifa fija del domicilio vigente (para mostrarla en el checkout). */
  getDeliveryFee(): number {
    return this._configService.get<number>('app.deliveryFee') ?? 0;
  }

  // ---------- creación (cliente) ----------

  async create(user: User, dto: CreateInvoiceDto): Promise<Invoice> {
    // Negocio válido y activo.
    const organizational = await this._organizationalRepository.findOne({
      where: { id: dto.organizationalId },
    });
    if (!organizational || !organizational.isActive) {
      throw new BadRequestException('El negocio no está disponible.');
    }

    // Un negocio cerrado no recibe pedidos (nadie los prepararía).
    if (!isBusinessOpen(organizational)) {
      throw new BadRequestException(
        organizational.temporarilyClosed
          ? 'El negocio está cerrado temporalmente. Intenta más tarde.'
          : 'El negocio está cerrado en este momento. Podrás pedir dentro de su horario de atención.',
      );
    }

    // Dirección: debe ser del propio usuario (se copia como snapshot).
    const address = await this._userAddressRepository.findOne({
      where: { id: dto.addressId, userId: user.id },
    });
    if (!address) {
      throw new BadRequestException(
        'La dirección de entrega no es válida o no te pertenece.',
      );
    }

    const paidType = await this._paidTypeRepository.findOne({
      where: { code: dto.paidTypeCode },
    });
    if (!paidType) {
      throw new BadRequestException('El método de pago no es válido.');
    }

    // Productos: todos del MISMO negocio, activos. Se snapshotean precios.
    const productIds = [...new Set(dto.items.map((item) => item.productId))];
    const products = await this._productRepository.find({
      where: { id: In(productIds), organizationalId: organizational.id },
    });
    if (products.length !== productIds.length) {
      throw new BadRequestException(
        'Algún producto no existe o no pertenece a este negocio.',
      );
    }
    const productById = new Map(products.map((p) => [p.id, p]));

    const details: InvoiceDetail[] = [];
    let subtotal = 0;
    for (const item of dto.items) {
      const product = productById.get(item.productId)!;
      if (!product.isActive) {
        throw new BadRequestException(
          `El producto "${product.name}" ya no está disponible.`,
        );
      }
      const discount = product.discount ?? 0;
      const finalUnit = this.round2(product.priceSale * (1 - discount / 100));
      const lineTotal = this.round2(finalUnit * item.quantity);
      subtotal = this.round2(subtotal + lineTotal);

      const detail = new InvoiceDetail();
      detail.productId = product.id;
      detail.productName = product.name;
      detail.unitPrice = product.priceSale;
      detail.discount = discount;
      detail.quantity = item.quantity;
      detail.lineTotal = lineTotal;
      details.push(detail);
    }

    const pendingState = await this.resolveState(StateTypeCode.PENDING);
    const deliveryFee = this._configService.get<number>('app.deliveryFee') ?? 0;
    const total = this.round2(subtotal + deliveryFee);

    // Transacción: cabecera + renglones juntos.
    const saved = await this._dataSource.transaction(async (manager) => {
      const invoice = manager.create(Invoice, {
        userId: user.id,
        organizationalId: organizational.id,
        stateTypeId: pendingState.id,
        paidTypeId: paidType.id,
        deliveryAddress: address.address,
        deliveryDetails: address.details ?? null,
        deliveryLatitude: address.latitude ?? null,
        deliveryLongitude: address.longitude ?? null,
        subtotal,
        deliveryFee,
        total,
        notes: dto.notes ?? null,
        // Códigos del flujo físico: recogida (repartidor → negocio) y
        // entrega (cliente → repartidor).
        pickupCode: this.randomCode(),
        deliveryCode: this.randomCode(),
      });
      const savedInvoice = await manager.save(invoice);
      for (const detail of details) detail.invoiceId = savedInvoice.id;
      await manager.save(details);
      return savedInvoice;
    });

    const full = await this.findByIdWithRelations(saved.id);
    // El negocio ve el pedido entrante en vivo (sin códigos: no los necesita).
    this._gateway.emitToOrg(organizational.id, 'invoice:created', {
      ...full,
      pickupCode: null,
      deliveryCode: null,
    });
    // Push al dueño (el socket solo sirve con la app abierta).
    void this._pushService.sendToUsers([organizational.legalPersonId], {
      title: '¡Nuevo pedido! 🛍️',
      body: `Pedido #${full.id} por ${this.formatCop(full.total)}. Ábrelo para aceptarlo.`,
      data: { type: 'order', invoiceId: full.id },
    });
    return this.hideCodesFor(user, full);
  }

  // ---------- lectura (scoped por rol) ----------

  async findOne(user: User, id: number): Promise<Invoice> {
    const invoice = await this.findByIdWithRelations(id);
    if (!invoice) throw new NotFoundException('Pedido no encontrado');
    await this.assertCanView(user, invoice);
    return this.hideCodesFor(user, invoice);
  }

  async paginatedList(
    user: User,
    params: PaginatedInvoicesParamsDto,
  ): Promise<ResponsePaginationDto<Invoice>> {
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 10;
    const skip = (page - 1) * perPage;

    const query = this._invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.organizational', 'organizational')
      .leftJoinAndSelect('invoice.stateType', 'stateType')
      .leftJoinAndSelect('invoice.paidType', 'paidType')
      .leftJoinAndSelect('invoice.deliveryUser', 'deliveryUser')
      .leftJoinAndSelect('invoice.user', 'client')
      .skip(skip)
      .take(perPage)
      .orderBy('invoice.createdAt', params.order ?? 'DESC');

    // Alcance por rol.
    const roleCode = user.roleType?.code;
    if (roleCode === RoleTypeCode.CLIENT) {
      query.andWhere('invoice.userId = :uid', { uid: user.id });
    } else if (roleCode === RoleTypeCode.BUSINESS) {
      const org = await this.findMyOrganizational(user);
      query.andWhere('invoice.organizationalId = :oid', { oid: org.id });
    } else if (roleCode === RoleTypeCode.DELIVERY) {
      query.andWhere('invoice.deliveryUserId = :did', { did: user.id });
    }
    // ADMIN: sin filtro (ve todos).

    if (params.stateCodes) {
      const codes = params.stateCodes
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      if (codes.length) {
        query.andWhere('stateType.code IN (:...codes)', { codes });
      }
    }

    const [entities, itemCount] = await query.getManyAndCount();
    const sanitized = entities.map((e) => this.hideCodesFor(user, e));
    const pagination = new PageMetaDto({ itemCount, pageOptionsDto: params });
    return new ResponsePaginationDto(sanitized, pagination);
  }

  /**
   * Pedidos DISPONIBLES para que un repartidor los tome: listos (PREP) y sin
   * repartidor asignado. Ordenados por antigüedad (primero el más viejo).
   */
  async availableForDelivery(
    user: User,
    params: PaginatedInvoicesParamsDto,
  ): Promise<ResponsePaginationDto<Invoice>> {
    this.assertRole(user, RoleTypeCode.DELIVERY);

    const page = params.page ?? 1;
    const perPage = params.perPage ?? 10;
    const skip = (page - 1) * perPage;

    const prepState = await this.resolveState(StateTypeCode.PREPARING);

    const query = this._invoiceRepository
      .createQueryBuilder('invoice')
      .leftJoinAndSelect('invoice.organizational', 'organizational')
      .leftJoinAndSelect('invoice.stateType', 'stateType')
      .leftJoinAndSelect('invoice.paidType', 'paidType')
      .where('invoice.stateTypeId = :prep', { prep: prepState.id })
      .andWhere('invoice.deliveryUserId IS NULL');

    if (params.lat != null && params.lng != null) {
      // Solo pedidos cuyo NEGOCIO (punto de recogida) esté a ≤ radio km del
      // repartidor, ordenados por cercanía. offset/limit en vez de skip/take:
      // el orderBy con expresión cruda rompe la subquery DISTINCT del
      // paginado con joins (gotcha §20 de NOTAS) — aquí todos los joins son
      // ManyToOne (sin duplicar filas), así que es equivalente.
      const radiusKm =
        this._configService.get<number>('app.nearbyRadiusKm') ?? 10;
      const distanceSql = `(6371 * acos(least(1, cos(radians(:nearLat)) * cos(radians(organizational.latitude))
        * cos(radians(organizational.longitude) - radians(:nearLng))
        + sin(radians(:nearLat)) * sin(radians(organizational.latitude)))))`;
      query
        .andWhere(
          'organizational.latitude IS NOT NULL AND organizational.longitude IS NOT NULL',
        )
        .andWhere(`${distanceSql} <= :radiusKm`, {
          nearLat: params.lat,
          nearLng: params.lng,
          radiusKm,
        })
        .orderBy(distanceSql, 'ASC')
        .addOrderBy('invoice.createdAt', 'ASC')
        .offset(skip)
        .limit(perPage);
    } else {
      query.orderBy('invoice.createdAt', 'ASC').skip(skip).take(perPage);
    }

    const [entities, itemCount] = await query.getManyAndCount();

    // Disponibles: los leen TODOS los repartidores — sin códigos.
    for (const entity of entities) {
      entity.pickupCode = null;
      entity.deliveryCode = null;
    }

    const pagination = new PageMetaDto({ itemCount, pageOptionsDto: params });
    return new ResponsePaginationDto(entities, pagination);
  }

  // ---------- repartidor toma el pedido ----------

  async take(user: User, id: number): Promise<Invoice> {
    this.assertRole(user, RoleTypeCode.DELIVERY);
    const prepState = await this.resolveState(StateTypeCode.PREPARING);

    // Claim atómico: solo lo toma si sigue disponible (evita carrera entre
    // dos repartidores). Si no afecta filas, ya lo tomó otro.
    const result = await this._invoiceRepository
      .createQueryBuilder()
      .update(Invoice)
      .set({ deliveryUserId: user.id, takenAt: new Date() })
      .where('id = :id', { id })
      .andWhere('stateTypeId = :prep', { prep: prepState.id })
      .andWhere('deliveryUserId IS NULL')
      .execute();

    if (!result.affected) {
      // Puede ser: no existe, no está listo, o ya lo tomaron.
      const exists = await this._invoiceRepository.findOne({ where: { id } });
      if (!exists) throw new NotFoundException('Pedido no encontrado');
      throw new ConflictException(
        'Este pedido ya no está disponible (otro repartidor lo tomó o cambió de estado).',
      );
    }

    const full = await this.findByIdWithRelations(id);
    // El cliente y el negocio ven que ya hay repartidor; se retira de la lista.
    this._gateway.emitToUser(full.userId, 'invoice:updated', {
      ...full,
      pickupCode: null,
    });
    this._gateway.emitToOrg(full.organizationalId, 'invoice:updated', {
      ...full,
      pickupCode: null,
      deliveryCode: null,
    });
    this._gateway.emitToDeliveries('invoice:taken', { id });
    void this._pushService.sendToUsers([full.userId], {
      title: `Pedido #${full.id}`,
      body: 'Un repartidor tomó tu pedido. Pronto saldrá en camino.',
      data: { type: 'order', invoiceId: full.id },
    });
    return this.hideCodesFor(user, full);
  }

  // ---------- cambio de estado (máquina de estados) ----------

  async changeState(
    user: User,
    id: number,
    dto: UpdateInvoiceStateDto,
  ): Promise<Invoice> {
    const invoice = await this.findByIdWithRelations(id);
    if (!invoice) throw new NotFoundException('Pedido no encontrado');

    const roleCode = user.roleType?.code as RoleTypeCode | undefined;
    const fromCode = invoice.stateType?.code as string;
    const target = dto.stateCode;

    // ¿La transición existe y este rol puede hacerla?
    const allowed = (TRANSITIONS[fromCode] ?? []).find(
      (t) => t.to === target && roleCode && t.roles.includes(roleCode),
    );
    if (!allowed) {
      throw new BadRequestException(
        'No puedes cambiar el pedido a ese estado desde su estado actual.',
      );
    }

    // Ownership según el rol que hace la transición.
    await this.assertCanActOnTransition(user, invoice, target);

    // El negocio no puede despachar sin un repartidor que lo recoja.
    if (target === StateTypeCode.ON_ROUTE && !invoice.deliveryUserId) {
      throw new BadRequestException(
        'Aún no hay un repartidor asignado. Espera a que un repartidor tome el pedido.',
      );
    }

    // Verificación física de la recogida: el repartidor dicta SU código y el
    // negocio lo digita — prueba que la comida quedó en manos del asignado.
    if (target === StateTypeCode.ON_ROUTE && invoice.pickupCode) {
      if (!dto.verificationCode) {
        throw new BadRequestException(
          'Pídele al repartidor su código de recogida para despachar el pedido.',
        );
      }
      if (dto.verificationCode !== invoice.pickupCode) {
        throw new BadRequestException(
          'Código de recogida incorrecto. Verifícalo con el repartidor.',
        );
      }
    }

    // Verificación física de la entrega: el cliente dicta SU código y el
    // repartidor lo digita — prueba que el pedido llegó a la puerta correcta.
    if (target === StateTypeCode.DELIVERED && invoice.deliveryCode) {
      if (!dto.verificationCode) {
        throw new BadRequestException(
          'Pídele al cliente su código de entrega para confirmar la entrega.',
        );
      }
      if (dto.verificationCode !== invoice.deliveryCode) {
        throw new BadRequestException(
          'Código de entrega incorrecto. Verifícalo con el cliente.',
        );
      }
    }

    if (target === StateTypeCode.CANCELLED && !dto.cancellationReason) {
      throw new BadRequestException(
        'Debes indicar el motivo de la cancelación.',
      );
    }

    // Al aceptar, el negocio se compromete con un tiempo de preparación.
    if (target === StateTypeCode.ACCEPTED && !dto.prepEstimatedMinutes) {
      throw new BadRequestException(
        'Indica en cuántos minutos estará listo el pedido.',
      );
    }

    const targetState = await this.resolveState(target);
    invoice.stateTypeId = targetState.id;
    invoice.stateType = targetState;
    if (target === StateTypeCode.CANCELLED) {
      invoice.cancellationReason = dto.cancellationReason ?? null;
    }
    this.stampTransition(invoice, target, dto);
    await this._invoiceRepository.save(invoice);

    const full = await this.findByIdWithRelations(id);
    this.broadcastStateChange(full, target);
    this.pushStateChange(full, target, roleCode);
    return this.hideCodesFor(user, full);
  }

  // ---------- helpers ----------

  /** Código de verificación de 4 dígitos ("0000"–"9999"). */
  private randomCode(): string {
    return randomInt(0, 10000).toString().padStart(4, '0');
  }

  /**
   * Cada rol solo ve SU código: el CLIENTE dueño el de entrega y el
   * REPARTIDOR asignado el de recogida. El de entrega jamás le llega a un
   * repartidor (es el candado contra entregas falsas); el negocio no ve
   * ninguno (digita el que le dictan). Admin ve ambos (soporte). Devuelve una
   * copia para no ensuciar el objeto que usan los broadcasts.
   */
  private hideCodesFor(user: User, invoice: Invoice): Invoice {
    const role = user.roleType?.code;
    if (role === RoleTypeCode.ADMIN) return invoice;
    const copy = Object.assign(
      Object.create(Object.getPrototypeOf(invoice) as object),
      invoice,
    ) as Invoice;
    if (role !== RoleTypeCode.CLIENT || invoice.userId !== user.id) {
      copy.deliveryCode = null;
    }
    if (role !== RoleTypeCode.DELIVERY || invoice.deliveryUserId !== user.id) {
      copy.pickupCode = null;
    }
    return copy;
  }

  /**
   * Sella el timestamp de la transición y guarda los estimados: al ACEPTAR,
   * los minutos que promete el negocio; al DESPACHAR (RUTA), la estimación de
   * entrega por distancia (o el fijo de config si faltan coordenadas).
   */
  private stampTransition(
    invoice: Invoice,
    target: StateTypeCode,
    dto: UpdateInvoiceStateDto,
  ): void {
    const now = new Date();
    switch (target) {
      case StateTypeCode.ACCEPTED:
        invoice.acceptedAt = now;
        invoice.prepEstimatedMinutes = dto.prepEstimatedMinutes ?? null;
        break;
      case StateTypeCode.PREPARING:
        invoice.preparingAt = now;
        break;
      case StateTypeCode.ON_ROUTE:
        invoice.onRouteAt = now;
        invoice.deliveryEstimatedMinutes = this.estimateDeliveryMinutes(invoice);
        break;
      case StateTypeCode.DELIVERED:
        invoice.deliveredAt = now;
        break;
      case StateTypeCode.CANCELLED:
        invoice.cancelledAt = now;
        break;
    }
  }

  /**
   * Minutos estimados de entrega: distancia en línea recta entre el negocio y
   * la dirección del pedido (coords ya guardadas) × factor de ruta real (1.3)
   * a ~25 km/h de moto urbana + 5 min de margen, acotado a 10–90 min. Si
   * faltan coordenadas cae al fijo APP_DELIVERY_ETA_MINUTES.
   */
  private estimateDeliveryMinutes(invoice: Invoice): number {
    const fallback =
      this._configService.get<number>('app.deliveryEtaMinutes') ?? 20;
    const org = invoice.organizational;
    if (
      org?.latitude == null ||
      org?.longitude == null ||
      invoice.deliveryLatitude == null ||
      invoice.deliveryLongitude == null
    ) {
      return fallback;
    }
    const distKm = this.haversineKm(
      org.latitude,
      org.longitude,
      invoice.deliveryLatitude,
      invoice.deliveryLongitude,
    );
    const minutes = Math.round(((distKm * 1.3) / 25) * 60) + 5;
    return Math.min(Math.max(minutes, 10), 90);
  }

  /** Distancia en km entre dos coordenadas (fórmula de haversine). */
  private haversineKm(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private broadcastStateChange(invoice: Invoice, target: StateTypeCode): void {
    // Cliente y negocio siempre quieren saber. Cada rol recibe solo SU
    // código (el de entrega JAMÁS viaja hacia repartidores).
    this._gateway.emitToUser(invoice.userId, 'invoice:updated', {
      ...invoice,
      pickupCode: null,
    });
    this._gateway.emitToOrg(invoice.organizationalId, 'invoice:updated', {
      ...invoice,
      pickupCode: null,
      deliveryCode: null,
    });
    if (invoice.deliveryUserId) {
      this._gateway.emitToDelivery(invoice.deliveryUserId, 'invoice:updated', {
        ...invoice,
        deliveryCode: null,
      });
    }
    // Al pasar a PREP entra a la lista de disponibles de los repartidores.
    if (target === StateTypeCode.PREPARING) {
      this._gateway.emitToDeliveries('invoice:available', {
        ...invoice,
        pickupCode: null,
        deliveryCode: null,
      });
    }
  }

  /**
   * Push del cambio de estado a quien NO lo provocó (el socket cubre la app
   * abierta; el push cubre la app cerrada). Fire-and-forget: PushService ya
   * captura sus errores.
   */
  private pushStateChange(
    invoice: Invoice,
    target: StateTypeCode,
    actorRole?: RoleTypeCode,
  ): void {
    const num = `#${invoice.id}`;
    const orgName =
      invoice.organizational?.tradeName ||
      invoice.organizational?.legalName ||
      'El negocio';
    const data = { type: 'order', invoiceId: invoice.id };

    switch (target) {
      case StateTypeCode.ACCEPTED:
        void this._pushService.sendToUsers([invoice.userId], {
          title: `Pedido ${num} aceptado ✅`,
          body: invoice.prepEstimatedMinutes
            ? `${orgName} aceptó tu pedido. Estará listo en ~${invoice.prepEstimatedMinutes} min.`
            : `${orgName} aceptó tu pedido.`,
          data,
        });
        break;
      case StateTypeCode.PREPARING:
        void this._pushService.sendToUsers([invoice.userId], {
          title: `Pedido ${num} en preparación 🍳`,
          body: `${orgName} está preparando tu pedido.`,
          data,
        });
        // Entra a la lista de disponibles: avisar a los repartidores.
        void this._pushService.sendToActiveDeliveries({
          title: 'Pedido disponible para entregar 🛵',
          body: `${orgName} tiene el pedido ${num} listo para recoger.`,
          data,
        });
        break;
      case StateTypeCode.ON_ROUTE:
        void this._pushService.sendToUsers([invoice.userId], {
          title: `¡Tu pedido ${num} va en camino! 🛵`,
          body: 'El repartidor va hacia tu dirección. Ten a mano tu código de entrega.',
          data,
        });
        break;
      case StateTypeCode.DELIVERED:
        void this._pushService.sendToUsers([invoice.userId], {
          title: `Pedido ${num} entregado 🎉`,
          body: '¡Gracias por pedir en Mándalo!',
          data,
        });
        break;
      case StateTypeCode.CANCELLED:
        if (actorRole === RoleTypeCode.CLIENT) {
          // El cliente canceló: avisar al negocio.
          void this._pushService.sendToUsers(
            [invoice.organizational?.legalPersonId],
            {
              title: `Pedido ${num} cancelado`,
              body: 'El cliente canceló el pedido.',
              data,
            },
          );
        } else {
          // El negocio canceló: avisar al cliente (y al repartidor si ya había).
          void this._pushService.sendToUsers(
            [invoice.userId, invoice.deliveryUserId],
            {
              title: `Pedido ${num} cancelado`,
              body: invoice.cancellationReason
                ? `Motivo: ${invoice.cancellationReason}`
                : 'El negocio canceló el pedido.',
              data,
            },
          );
        }
        break;
    }
  }

  /** "$ 44.400" — formato COP corto para el cuerpo de las notificaciones. */
  private formatCop(value: number): string {
    return `$ ${Math.round(value).toLocaleString('es-CO')}`;
  }

  private async findByIdWithRelations(id: number): Promise<Invoice> {
    return this._invoiceRepository.findOne({
      where: { id },
      relations: [
        'organizational',
        'stateType',
        'paidType',
        'deliveryUser',
        'user',
        'details',
        'details.product',
      ],
    });
  }

  /** Negocio del usuario autenticado (rol NEGO). */
  private async findMyOrganizational(user: User) {
    const org = await this._organizationalRepository.findOne({
      where: { legalPersonId: user.id },
    });
    if (!org) {
      throw new NotFoundException(
        'Tu cuenta no tiene un negocio asociado. Contacta al administrador.',
      );
    }
    return org;
  }

  private async assertCanView(user: User, invoice: Invoice): Promise<void> {
    const roleCode = user.roleType?.code;
    if (roleCode === RoleTypeCode.ADMIN) return;
    if (roleCode === RoleTypeCode.CLIENT && invoice.userId === user.id) return;
    if (roleCode === RoleTypeCode.DELIVERY) {
      // El repartidor ve los suyos y los disponibles (para decidir tomarlos).
      if (invoice.deliveryUserId === user.id) return;
      const prepState = await this.resolveState(StateTypeCode.PREPARING);
      if (invoice.stateTypeId === prepState.id && !invoice.deliveryUserId)
        return;
    }
    if (roleCode === RoleTypeCode.BUSINESS) {
      const org = await this.findMyOrganizational(user);
      if (invoice.organizationalId === org.id) return;
    }
    throw new ForbiddenException('No tienes acceso a este pedido.');
  }

  private async assertCanActOnTransition(
    user: User,
    invoice: Invoice,
    target: StateTypeCode,
  ): Promise<void> {
    const roleCode = user.roleType?.code;
    if (roleCode === RoleTypeCode.CLIENT) {
      if (invoice.userId !== user.id) {
        throw new ForbiddenException('Este pedido no es tuyo.');
      }
    } else if (roleCode === RoleTypeCode.BUSINESS) {
      const org = await this.findMyOrganizational(user);
      if (invoice.organizationalId !== org.id) {
        throw new ForbiddenException('Este pedido no es de tu negocio.');
      }
    } else if (roleCode === RoleTypeCode.DELIVERY) {
      // Solo puede mover pedidos que él tomó.
      if (invoice.deliveryUserId !== user.id) {
        throw new ForbiddenException(
          'Solo puedes gestionar pedidos que hayas tomado.',
        );
      }
    } else {
      throw new ForbiddenException('No puedes cambiar el estado de este pedido.');
    }
  }

  private assertRole(user: User, role: RoleTypeCode): void {
    if (user.roleType?.code !== role) {
      throw new ForbiddenException('No tienes permiso para esta acción.');
    }
  }

  /** Resuelve un StateType por su code (config de la DB). */
  private async resolveState(code: StateTypeCode): Promise<StateType> {
    const state = await this._stateTypeRepository.findOne({ where: { code } });
    if (!state) {
      throw new InternalServerErrorException(
        `Falta el estado "${code}" en la tabla stateType. Configúralo en la DB.`,
      );
    }
    return state;
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
