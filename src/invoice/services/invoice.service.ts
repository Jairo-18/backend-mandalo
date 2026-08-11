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
import { APP_TIMEZONE } from '../../shared/constants/timezone';
import { isBusinessOpen } from '../../shared/utils/business-hours.util';
import { PushService } from '../../shared/services/push.service';
import { DeliveryPricingService } from '../../shared/services/delivery-pricing.service';
import { WeatherService } from '../../shared/services/weather.service';
import { LocalStorageService } from '../../localStorage/services/localStorage.service';
import {
  CreateInvoiceDto,
  PaginatedInvoicesParamsDto,
  UpdateInvoiceStateDto,
} from '../dtos/invoice.dto';
import { InvoiceGateway } from '../invoice.gateway';

/**
 * Tarifa del domicilio + desglose de recargos por tipo (reunión con el
 * cliente 2026-08-04: "control estricto" en Mis cobros/admin). Las 3 columnas
 * de recargo SIEMPRE deben sumar `deliverySurcharge`; `surchargeReasons` es
 * el texto amigable para el preview del checkout.
 */
export interface DeliveryFeeBreakdown {
  deliveryFee: number;
  deliverySurcharge: number;
  nightSurcharge: number;
  weatherSurcharge: number;
  demandSurcharge: number;
  surchargeReasons: string[];
  distanceKm: number | null;
}

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
    // A FALL solo se llega por `reportDeliveryFailure` (foto obligatoria,
    // reunión 2026-08-04) — no es una transición genérica de `changeState`.
    [StateTypeCode.ON_ROUTE]: [
      { to: StateTypeCode.DELIVERED, roles: [RoleTypeCode.DELIVERY] },
    ],
    // Entrega fallida: el CLIENTE decide — reintentar (paga el cargo del
    // Anexo I, un solo reintento por pedido) o cancelar (Art. 32 TYC).
    [StateTypeCode.DELIVERY_FAILED]: [
      { to: StateTypeCode.ON_ROUTE, roles: [RoleTypeCode.CLIENT] },
      { to: StateTypeCode.CANCELLED, roles: [RoleTypeCode.CLIENT] },
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
    private readonly _localStorageService: LocalStorageService,
    private readonly _deliveryPricingService: DeliveryPricingService,
    private readonly _weatherService: WeatherService,
  ) {}

  /**
   * Tarifa del domicilio para el checkout: por distancia entre el negocio y
   * la dirección de entrega si hay coordenadas de los dos lados; si falta
   * alguna, cae a la tarifa fija de respaldo (`APP_DELIVERY_FEE`), sin
   * recargos (no hay punto de origen que evaluar). De paso calcula la
   * tarifa de servicio (si mandaron `subtotal`) para que el checkout arme
   * el total completo con una sola llamada.
   */
  async previewDeliveryFee(params: {
    organizationalId: number;
    latitude?: number;
    longitude?: number;
    subtotal?: number;
  }): Promise<DeliveryFeeBreakdown & { serviceFee: number }> {
    const breakdown = await this.computeDeliveryFee(
      params.organizationalId,
      params.latitude,
      params.longitude,
    );
    return {
      ...breakdown,
      serviceFee: this.computeServiceFee(params.subtotal ?? 0),
    };
  }

  /**
   * Tarifa de servicio: % del subtotal (SIN domicilio) — 100% ingreso de
   * Mándalo, no toca la comisión del negocio (se calcula sobre el subtotal
   * igual, ver `settlement.service.ts`) ni el corte del repartidor (se
   * calcula sobre `deliveryFee`) porque vive en su propio campo.
   * `APP_SERVICE_FEE_CAP` en 0 (default) = sin tope, conforme al Art. 38 de
   * los Términos y Condiciones (NOTAS §59); un valor > 0 vuelve a topar.
   */
  private computeServiceFee(subtotal: number): number {
    const percent =
      this._configService.get<number>('app.serviceFeePercent') ?? 5;
    const cap = this._configService.get<number>('app.serviceFeeCap') ?? 0;
    const fee = this.round2((subtotal * percent) / 100);
    return cap > 0 ? Math.min(fee, cap) : fee;
  }

  private async computeDeliveryFee(
    organizationalId: number,
    latitude?: number,
    longitude?: number,
  ): Promise<DeliveryFeeBreakdown> {
    const organizational = await this._organizationalRepository.findOne({
      where: { id: organizationalId },
    });
    return this.deliveryFeeFromOrg(organizational, latitude, longitude);
  }

  /**
   * Tarifa base (distancia) + recargos (reunión con el cliente 2026-08-04:
   * nocturno determinístico, clima vía `WeatherService` con umbral de lluvia
   * fuerte, demanda GLOBAL de toda la app). Los recargos solo se evalúan si
   * hay coordenadas del negocio — sin eso ya se cae a la tarifa fija de
   * respaldo, sin recargos (no hay de dónde calcularlos).
   */
  private async deliveryFeeFromOrg(
    organizational: { latitude?: number; longitude?: number } | null,
    latitude?: number,
    longitude?: number,
  ): Promise<DeliveryFeeBreakdown> {
    if (
      organizational?.latitude == null ||
      organizational?.longitude == null ||
      latitude == null ||
      longitude == null
    ) {
      return {
        deliveryFee: this._deliveryPricingService.fallbackFee,
        deliverySurcharge: 0,
        nightSurcharge: 0,
        weatherSurcharge: 0,
        demandSurcharge: 0,
        surchargeReasons: [],
        distanceKm: null,
      };
    }
    const distanceKm = this._deliveryPricingService.haversineKm(
      organizational.latitude,
      organizational.longitude,
      latitude,
      longitude,
    );
    const deliveryFee = this._deliveryPricingService.feeForDistance(distanceKm);

    const nightSurcharge = this._deliveryPricingService.nightSurchargeAmount();

    let weatherSurcharge = 0;
    const isBadWeather = await this._weatherService.isBadWeather(
      organizational.latitude,
      organizational.longitude,
    );
    if (isBadWeather) {
      weatherSurcharge =
        this._configService.get<number>('app.deliveryWeatherSurcharge') ?? 0;
    }

    let demandSurcharge = 0;
    const isHighDemand = await this.isHighDemand();
    if (isHighDemand) {
      demandSurcharge =
        this._configService.get<number>('app.deliveryDemandSurcharge') ?? 0;
    }

    const surchargeReasons: string[] = [];
    if (nightSurcharge > 0) surchargeReasons.push('recargo nocturno');
    if (weatherSurcharge > 0) surchargeReasons.push('condiciones climáticas');
    if (demandSurcharge > 0) surchargeReasons.push('alta demanda');

    return {
      deliveryFee,
      deliverySurcharge: this.round2(
        nightSurcharge + weatherSurcharge + demandSurcharge,
      ),
      nightSurcharge: this.round2(nightSurcharge),
      weatherSurcharge: this.round2(weatherSurcharge),
      demandSurcharge: this.round2(demandSurcharge),
      surchargeReasons,
      distanceKm: this.round2(distanceKm),
    };
  }

  /**
   * "Alta demanda" GLOBAL (reunión con el cliente 2026-08-04: no por
   * negocio — toda la app): ¿hay `deliveryDemandThreshold` o más pedidos
   * listos (PREP) sin repartidor asignado ahora mismo, en cualquier
   * negocio? Mismo criterio de estado que alimenta la lista de
   * "Disponibles" del repartidor (`availableForDelivery`), pero sin filtrar
   * por negocio.
   */
  private async isHighDemand(): Promise<boolean> {
    const threshold =
      this._configService.get<number>('app.deliveryDemandThreshold') ?? 0;
    if (threshold <= 0) return false;

    const prepState = await this.resolveState(StateTypeCode.PREPARING);
    const count = await this._invoiceRepository.count({
      where: {
        stateTypeId: prepState.id,
        deliveryUserId: null,
      },
    });
    return count >= threshold;
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
    // Mismo cálculo por distancia del preview del checkout — se recalcula acá
    // (no se confía en lo que mandó el cliente) para que el cobro sea real.
    const {
      deliveryFee,
      deliverySurcharge,
      nightSurcharge,
      weatherSurcharge,
      demandSurcharge,
    } = await this.deliveryFeeFromOrg(
      organizational,
      address.latitude ?? undefined,
      address.longitude ?? undefined,
    );
    // Reparto Mándalo/repartidor de `deliveryFee`, congelado en la factura
    // (ver comentario de las columnas en la entidad) — la liquidación del
    // repartidor lee esto en vez de recalcularlo con la config vigente.
    const { mandaloCut: deliveryMandaloCut, riderCut: deliveryRiderCut } =
      this._deliveryPricingService.splitFee(deliveryFee);
    const serviceFee = this.computeServiceFee(subtotal);
    const total = this.round2(
      subtotal + deliveryFee + deliverySurcharge + serviceFee,
    );

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
        deliveryMandaloCut,
        deliveryRiderCut,
        deliverySurcharge,
        nightSurcharge,
        weatherSurcharge,
        demandSurcharge,
        serviceFee,
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

  /**
   * Total histórico de tarifa de servicio (100% ingreso de Mándalo) sumado
   * sobre los pedidos ENTREGADOS — mismo criterio de "plata real" que usa
   * `settlement.service.ts` para `salesTotal`. Solo ADMIN.
   */
  async serviceFeeSummary(
    user: User,
  ): Promise<{ total: number; ordersCount: number }> {
    this.assertRole(user, RoleTypeCode.ADMIN);

    const row = await this._invoiceRepository
      .createQueryBuilder('invoice')
      .innerJoin('invoice.stateType', 'stateType')
      .select('COALESCE(SUM(invoice."serviceFee"), 0)', 'total')
      .addSelect('COUNT(*)::int', 'ordersCount')
      .where('stateType.code = :delivered', {
        delivered: StateTypeCode.DELIVERED,
      })
      .getRawOne<{ total: string; ordersCount: number }>();

    return {
      total: this.round2(parseFloat(row?.total ?? '0')),
      ordersCount: Number(row?.ordersCount ?? 0),
    };
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
    } else if (roleCode === RoleTypeCode.ADMIN) {
      // ADMIN ve todos; filtros opcionales para los cobros por período
      // (negocio puntual + rango de fechas de ENTREGA en hora local).
      if (params.organizationalId) {
        query.andWhere('invoice.organizationalId = :adminOid', {
          adminOid: params.organizationalId,
        });
      }
      if (params.deliveredFrom) {
        query.andWhere(
          `(invoice."deliveredAt" AT TIME ZONE '${APP_TIMEZONE}')::date >= :dfrom`,
          { dfrom: params.deliveredFrom },
        );
      }
      if (params.deliveredTo) {
        query.andWhere(
          `(invoice."deliveredAt" AT TIME ZONE '${APP_TIMEZONE}')::date <= :dto`,
          { dto: params.deliveredTo },
        );
      }
    }

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
    this.assertHasArl(user);

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
    this.assertHasArl(user);
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

  /**
   * Cobra el cargo único del segundo intento de forma ATÓMICA: UPDATE
   * condicional sobre `retryCount = 0` (mismo patrón de claim que `take()`),
   * con los montos incrementados en SQL en vez de recalculados a partir de
   * un valor leído antes en memoria. Sin esto, dos peticiones casi
   * simultáneas al mismo pedido (doble tap, o un reintento automático de la
   * app sobre la conexión rural típica de esta zona) podían cobrar el
   * recargo dos veces y saltarse el límite de "un solo reintento por
   * pedido" — los dos call sites de retry (`retryAfterTimeout` y el tramo
   * FALL→RUTA de `changeState`) comparten este mismo guard.
   * Devuelve el monto cobrado, o `null` si el reintento ya se había usado.
   */
  private async chargeRetryFeeOnce(id: number): Promise<number | null> {
    const retryFee =
      this._configService.get<number>('app.deliveryRetryFee') ?? 0;
    const result = await this._invoiceRepository
      .createQueryBuilder()
      .update(Invoice)
      .set({
        retryCount: 1,
        retryFeeCharged: retryFee,
        retryAcceptedAt: new Date(),
        deliverySurcharge: () => `COALESCE("deliverySurcharge", 0) + :fee`,
        total: () => `"total" + :fee`,
      })
      .where('id = :id', { id })
      .andWhere('retryCount = 0')
      .setParameters({ fee: retryFee })
      .execute();
    return result.affected ? retryFee : null;
  }

  // ---------- en sitio / segundo intento por tiempo (reunión 2026-08-04) ----------

  /**
   * El repartidor marca que llegó a la dirección de entrega — obligatorio
   * antes de poder "Marcar entregado" (ver guard en `changeState`). Arranca
   * la espera de `deliveryWaitMinutes` antes de habilitar el segundo intento
   * pagado. No cambia el estado del pedido (sigue en RUTA).
   */
  async arrive(user: User, id: number): Promise<Invoice> {
    this.assertRole(user, RoleTypeCode.DELIVERY);
    const invoice = await this.findByIdWithRelations(id);
    if (!invoice) throw new NotFoundException('Pedido no encontrado');
    if (invoice.deliveryUserId !== user.id) {
      throw new ForbiddenException(
        'Solo puedes gestionar pedidos que hayas tomado.',
      );
    }
    if (invoice.stateType?.code !== StateTypeCode.ON_ROUTE) {
      throw new BadRequestException(
        'Solo puedes marcar "En sitio" mientras el pedido está en camino.',
      );
    }
    if (invoice.arrivedAt) {
      throw new BadRequestException('Ya marcaste que llegaste a este pedido.');
    }

    invoice.arrivedAt = new Date();
    await this._invoiceRepository.save(invoice);

    const full = await this.findByIdWithRelations(id);
    this._gateway.emitToUser(full.userId, 'invoice:updated', {
      ...full,
      pickupCode: null,
    });
    this._gateway.emitToOrg(full.organizationalId, 'invoice:updated', {
      ...full,
      pickupCode: null,
      deliveryCode: null,
    });
    void this._pushService.sendToUsers([full.userId], {
      title: `Pedido #${full.id} — tu repartidor llegó 🛵`,
      body: 'Sal a recibirlo y dale tu código de entrega.',
      data: { type: 'order', invoiceId: full.id },
    });
    return this.hideCodesFor(user, full);
  }

  /**
   * "¿Deseas esperar 5 minutos más?" — se habilita cuando pasan
   * `deliveryWaitMinutes` desde `arrivedAt` sin que se complete la entrega.
   * Lo puede pedir el CLIENTE o el REPARTIDOR. Cobra el cargo único del
   * segundo intento (Anexo I) y reinicia el cronómetro — el pedido sigue en
   * RUTA todo el tiempo (nunca pasa visiblemente por FALL). Tope de un solo
   * uso por pedido, compartido con el reintento manual desde FALL
   * (`invoice.retryCount`).
   */
  async retryAfterTimeout(user: User, id: number): Promise<Invoice> {
    const roleCode = user.roleType?.code;
    if (
      roleCode !== RoleTypeCode.CLIENT &&
      roleCode !== RoleTypeCode.DELIVERY
    ) {
      throw new ForbiddenException('No puedes hacer esto.');
    }
    const invoice = await this.findByIdWithRelations(id);
    if (!invoice) throw new NotFoundException('Pedido no encontrado');
    if (roleCode === RoleTypeCode.CLIENT && invoice.userId !== user.id) {
      throw new ForbiddenException('Este pedido no es tuyo.');
    }
    if (
      roleCode === RoleTypeCode.DELIVERY &&
      invoice.deliveryUserId !== user.id
    ) {
      throw new ForbiddenException(
        'Solo puedes gestionar pedidos que hayas tomado.',
      );
    }
    if (invoice.stateType?.code !== StateTypeCode.ON_ROUTE) {
      throw new BadRequestException('El pedido no está en camino.');
    }
    if (!invoice.arrivedAt) {
      throw new BadRequestException(
        'El repartidor todavía no ha marcado "En sitio".',
      );
    }
    const waitMinutes =
      this._configService.get<number>('app.deliveryWaitMinutes') ?? 5;
    const elapsedMs = Date.now() - invoice.arrivedAt.getTime();
    if (elapsedMs < waitMinutes * 60_000) {
      throw new BadRequestException(
        `Todavía no pasan los ${waitMinutes} minutos de espera.`,
      );
    }
    if (invoice.retryCount >= 1) {
      throw new BadRequestException(
        'Ya se usó el único segundo intento permitido para este pedido.',
      );
    }

    const charged = await this.chargeRetryFeeOnce(id);
    if (charged === null) {
      throw new BadRequestException(
        'Ya se usó el único segundo intento permitido para este pedido.',
      );
    }
    // Reinicia el cronómetro — el repartidor sigue ahí, no hace falta que
    // vuelva a marcar "En sitio".
    await this._invoiceRepository.update(id, { arrivedAt: new Date() });

    const full = await this.findByIdWithRelations(id);
    this._gateway.emitToUser(full.userId, 'invoice:updated', {
      ...full,
      pickupCode: null,
    });
    if (full.deliveryUserId) {
      this._gateway.emitToDelivery(full.deliveryUserId, 'invoice:updated', {
        ...full,
        deliveryCode: null,
      });
    }
    this._gateway.emitToOrg(full.organizationalId, 'invoice:updated', {
      ...full,
      pickupCode: null,
      deliveryCode: null,
    });
    const recipients = [full.userId, full.deliveryUserId].filter(
      (v): v is string => !!v,
    );
    void this._pushService.sendToUsers(recipients, {
      title: `Pedido #${full.id} — segundo intento`,
      body: `Se dieron ${waitMinutes} minutos más de espera (cargo de $${charged.toLocaleString('es-CO')}).`,
      data: { type: 'order', invoiceId: full.id },
    });
    return this.hideCodesFor(user, full);
  }

  // ---------- soporte de pago (cliente, métodos distintos a efectivo) ----------

  /**
   * El CLIENTE dueño sube la foto/pantallazo del pago (transferencia, Nequi,
   * Daviplata…) para que el negocio verifique. Reemplaza el anterior si
   * vuelve a subir. El pago en efectivo no lleva soporte.
   */
  async uploadPaymentProof(
    user: User,
    id: number,
    file: Express.Multer.File,
  ): Promise<{ paymentProofUrl: string }> {
    const invoice = await this.findByIdWithRelations(id);
    if (!invoice) throw new NotFoundException('Pedido no encontrado');
    if (
      user.roleType?.code !== RoleTypeCode.CLIENT ||
      invoice.userId !== user.id
    ) {
      throw new ForbiddenException(
        'Solo el dueño del pedido puede subir el soporte de pago.',
      );
    }
    // 'EFEC' = efectivo (contra-entrega en billetes): no hay nada que probar.
    if (invoice.paidType?.code === 'EFEC') {
      throw new BadRequestException(
        'El pago en efectivo no necesita soporte.',
      );
    }
    if (invoice.stateType?.code === StateTypeCode.CANCELLED) {
      throw new BadRequestException(
        'El pedido está cancelado — no se puede adjuntar el soporte.',
      );
    }
    if (!file) {
      throw new BadRequestException('Adjunta la imagen del soporte de pago.');
    }

    const previous = this._localStorageService.publicIdFromUrl(
      invoice.paymentProofUrl,
    );
    const { imageUrl } = await this._localStorageService.saveImage(
      file,
      'payments',
    );
    invoice.paymentProofUrl = imageUrl;
    // Al reenviar, se borra el motivo de un rechazo anterior (el negocio lo
    // revisa de nuevo).
    invoice.paymentProofRejectedReason = null;
    await this._invoiceRepository.save(invoice);
    if (previous) await this._localStorageService.deleteImage(previous);

    // El negocio se entera al instante (socket con la app abierta + push).
    const full = await this.findByIdWithRelations(id);
    this._gateway.emitToOrg(full.organizationalId, 'invoice:updated', {
      ...full,
      pickupCode: null,
      deliveryCode: null,
    });
    void this._pushService.sendToUsers([full.organizational?.legalPersonId], {
      title: `Pedido #${full.id} — soporte de pago 💳`,
      body: 'El cliente subió el comprobante del pago. Ábrelo para verificarlo.',
      data: { type: 'order', invoiceId: full.id },
    });

    return { paymentProofUrl: imageUrl };
  }

  /**
   * El NEGOCIO le pide al cliente el comprobante del pago (botón "Solicitar
   * pago"): útil cuando el pedido se aceptó pero el cliente aún no ha subido
   * el soporte y por eso no se puede pasar a preparación. Solo notifica
   * (socket + push); no cambia el estado del pedido.
   */
  async requestPayment(user: User, id: number): Promise<void> {
    const invoice = await this.findByIdWithRelations(id);
    if (!invoice) throw new NotFoundException('Pedido no encontrado');

    if (user.roleType?.code !== RoleTypeCode.BUSINESS) {
      throw new ForbiddenException(
        'Solo el negocio puede solicitar el pago al cliente.',
      );
    }
    const org = await this.findMyOrganizational(user);
    if (invoice.organizationalId !== org.id) {
      throw new ForbiddenException('Este pedido no es de tu negocio.');
    }
    if (invoice.paidType?.code === 'EFEC') {
      throw new BadRequestException(
        'El pago en efectivo no necesita comprobante.',
      );
    }
    if (invoice.paymentProofUrl) {
      throw new BadRequestException(
        'El cliente ya subió el comprobante del pago.',
      );
    }
    const finished = [
      StateTypeCode.DELIVERED,
      StateTypeCode.CANCELLED,
    ] as string[];
    if (finished.includes(invoice.stateType?.code ?? '')) {
      throw new BadRequestException('El pedido ya está finalizado.');
    }

    const orgName = org.tradeName || org.legalName || 'El negocio';
    // Aviso en vivo (app abierta) + push (app cerrada) al cliente.
    this._gateway.emitToUser(invoice.userId, 'invoice:payment-requested', {
      invoiceId: invoice.id,
      message: `${orgName} necesita el comprobante de tu pago para preparar el pedido #${invoice.id}.`,
    });
    void this._pushService.sendToUsers([invoice.userId], {
      title: `Pedido #${invoice.id} — falta tu comprobante 💳`,
      body: `${orgName} necesita el comprobante de tu pago para empezar a preparar tu pedido.`,
      data: { type: 'order', invoiceId: invoice.id },
    });
  }

  /**
   * El NEGOCIO RECHAZA el comprobante que subió el cliente (la foto no
   * corresponde, el monto no coincide, etc.): borra la foto, guarda el motivo y
   * avisa al cliente para que vuelva a subir. No cambia el estado del pedido.
   */
  async rejectPayment(
    user: User,
    id: number,
    reason: string,
  ): Promise<void> {
    const invoice = await this.findByIdWithRelations(id);
    if (!invoice) throw new NotFoundException('Pedido no encontrado');

    if (user.roleType?.code !== RoleTypeCode.BUSINESS) {
      throw new ForbiddenException(
        'Solo el negocio puede rechazar el comprobante.',
      );
    }
    const org = await this.findMyOrganizational(user);
    if (invoice.organizationalId !== org.id) {
      throw new ForbiddenException('Este pedido no es de tu negocio.');
    }
    if (!invoice.paymentProofUrl) {
      throw new BadRequestException(
        'El cliente aún no ha subido un comprobante para rechazar.',
      );
    }
    if (!reason?.trim()) {
      throw new BadRequestException(
        'Indica por qué rechazas el comprobante (para que el cliente lo corrija).',
      );
    }

    const previous = this._localStorageService.publicIdFromUrl(
      invoice.paymentProofUrl,
    );
    invoice.paymentProofUrl = null;
    invoice.paymentProofRejectedReason = reason.trim();
    await this._invoiceRepository.save(invoice);
    if (previous) await this._localStorageService.deleteImage(previous);

    const full = await this.findByIdWithRelations(id);
    // El cliente ve el rechazo al instante (socket) + push si está cerrada.
    this._gateway.emitToUser(invoice.userId, 'invoice:updated', {
      ...full,
      pickupCode: null,
    });
    const orgName = org.tradeName || org.legalName || 'El negocio';
    void this._pushService.sendToUsers([invoice.userId], {
      title: `Pedido #${invoice.id} — comprobante rechazado`,
      body: `${orgName}: ${reason.trim()}. Vuelve a subir tu comprobante.`,
      data: { type: 'order', invoiceId: invoice.id },
    });
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
    // Solo aplica en el PRIMER despacho (desde PREP): en un reintento
    // (desde FALL) el repartidor nunca soltó el paquete, no hay nada que
    // volver a verificar.
    if (
      target === StateTypeCode.ON_ROUTE &&
      fromCode === StateTypeCode.PREPARING &&
      invoice.pickupCode
    ) {
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

    // Reintento de entrega (Anexo I / Art. 31-32 TYC, NOTAS §59): el cliente
    // acepta pagar el cargo único del segundo intento. Solo se permite UNA
    // vez por pedido — si ya se usó, la única salida desde FALL es cancelar.
    if (
      target === StateTypeCode.ON_ROUTE &&
      fromCode === StateTypeCode.DELIVERY_FAILED
    ) {
      if (invoice.retryCount >= 1) {
        throw new BadRequestException(
          'Ya se usó el único reintento de entrega permitido para este pedido — la única opción ahora es cancelar.',
        );
      }
      const charged = await this.chargeRetryFeeOnce(id);
      if (charged === null) {
        throw new BadRequestException(
          'Ya se usó el único reintento de entrega permitido para este pedido — la única opción ahora es cancelar.',
        );
      }
      // `chargeRetryFeeOnce` ya persistió el cobro con un UPDATE atómico —
      // hay que reflejarlo en el objeto en memoria para que el
      // `invoice.save()` genérico de más abajo (cambio de estado + stamps)
      // no lo pise con los valores viejos que se leyeron al principio.
      invoice.retryCount = 1;
      invoice.retryFeeCharged = charged;
      invoice.retryAcceptedAt = new Date();
      invoice.deliverySurcharge = this.round2(
        (invoice.deliverySurcharge ?? 0) + charged,
      );
      invoice.total = this.round2(invoice.total + charged);
    }

    // Marcar entregado exige haber marcado "En sitio" antes (reunión
    // 2026-08-04) — fuerza el orden real: llegar primero, entregar después.
    if (target === StateTypeCode.DELIVERED && !invoice.arrivedAt) {
      throw new BadRequestException(
        'Primero marca "En sitio" al llegar a la dirección de entrega.',
      );
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

    // Comprobante obligatorio para preparar (métodos distintos a efectivo): el
    // pedido se acepta sin él, pero el negocio no puede pasarlo a preparación
    // hasta que el cliente suba el comprobante del pago (§ flujo de recibo).
    if (
      target === StateTypeCode.PREPARING &&
      invoice.paidType?.code !== 'EFEC' &&
      !invoice.paymentProofUrl
    ) {
      throw new BadRequestException(
        'El cliente aún no ha subido el comprobante del pago. Solicítaselo antes de preparar el pedido.',
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

  /**
   * El repartidor reporta que NO PUDO entregar (Art. 31-32 TYC): motivo +
   * FOTO OBLIGATORIA del sitio/paquete (reunión 2026-08-04, evidencia para
   * resolver reclamos). Es el ÚNICO camino a FALL — no está en `TRANSITIONS`
   * a propósito, para que la foto no se pueda saltar llamando `changeState`
   * directo. El pedido queda esperando que el CLIENTE decida reintentar o
   * cancelar.
   */
  async reportDeliveryFailure(
    user: User,
    id: number,
    file: Express.Multer.File,
    failureReason: string,
  ): Promise<Invoice> {
    this.assertRole(user, RoleTypeCode.DELIVERY);
    const invoice = await this.findByIdWithRelations(id);
    if (!invoice) throw new NotFoundException('Pedido no encontrado');
    if (invoice.deliveryUserId !== user.id) {
      throw new ForbiddenException(
        'Solo puedes gestionar pedidos que hayas tomado.',
      );
    }
    if (invoice.stateType?.code !== StateTypeCode.ON_ROUTE) {
      throw new BadRequestException(
        'Solo puedes reportar esto mientras el pedido está en camino.',
      );
    }
    if (!failureReason?.trim()) {
      throw new BadRequestException(
        'Indica por qué no se pudo entregar el pedido.',
      );
    }
    if (!file) {
      throw new BadRequestException(
        'Toma una foto del sitio o del paquete para reportar la entrega fallida.',
      );
    }

    const { imageUrl } = await this._localStorageService.saveImage(
      file,
      'delivery-failures',
    );

    const failedState = await this.resolveState(StateTypeCode.DELIVERY_FAILED);
    invoice.stateTypeId = failedState.id;
    invoice.stateType = failedState;
    invoice.deliveryFailedAt = new Date();
    invoice.deliveryFailReason = failureReason.trim();
    invoice.deliveryFailPhotoUrl = imageUrl;
    await this._invoiceRepository.save(invoice);

    const full = await this.findByIdWithRelations(id);
    this.broadcastStateChange(full, StateTypeCode.DELIVERY_FAILED);
    this.pushStateChange(
      full,
      StateTypeCode.DELIVERY_FAILED,
      RoleTypeCode.DELIVERY,
    );
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
      case StateTypeCode.DELIVERY_FAILED:
        invoice.deliveryFailedAt = now;
        invoice.deliveryFailReason = dto.failureReason ?? null;
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
    const distKm = this._deliveryPricingService.haversineKm(
      org.latitude,
      org.longitude,
      invoice.deliveryLatitude,
      invoice.deliveryLongitude,
    );
    return this._deliveryPricingService.estimateMinutesForDistance(distKm);
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
          title:
            invoice.retryCount > 0
              ? `Reintento en camino 🛵 — pedido ${num}`
              : `¡Tu pedido ${num} va en camino! 🛵`,
          body:
            invoice.retryCount > 0
              ? 'El repartidor va de nuevo hacia tu dirección.'
              : 'El repartidor va hacia tu dirección. Ten a mano tu código de entrega.',
          data,
        });
        break;
      case StateTypeCode.DELIVERY_FAILED:
        // El repartidor no pudo entregar: el cliente decide reintentar
        // (pagando el cargo del Anexo I) o cancelar.
        void this._pushService.sendToUsers([invoice.userId], {
          title: `No pudimos entregar tu pedido ${num} ⚠️`,
          body: invoice.deliveryFailReason
            ? `Motivo: ${invoice.deliveryFailReason}. Abre el pedido para reintentar o cancelar.`
            : 'Abre el pedido para reintentar la entrega o cancelarlo.',
          data,
        });
        break;
      case StateTypeCode.DELIVERED:
        void this._pushService.sendToUsers([invoice.userId], {
          title: `Pedido ${num} entregado 🎉`,
          body: '¡Gracias por pedir en Mandalo!',
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

  /**
   * Sin número de ARL asignado, el repartidor no puede ver ni tomar pedidos
   * disponibles — aunque su cuenta esté activa (reunión con el cliente
   * 2026-08-04). Lo asigna el admin desde su panel.
   */
  private assertHasArl(user: User): void {
    if (!user.arlIndividualNumber) {
      throw new ForbiddenException(
        'Aún no tienes asignado tu número de ARL. El administrador debe asignarlo antes de que puedas ver pedidos.',
      );
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
