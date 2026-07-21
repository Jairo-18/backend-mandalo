import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceRepository } from '../../shared/repositories/invoice.repository';
import { UserRepository } from '../../shared/repositories/user.repository';
import { DeliverySettlementRepository } from '../../shared/repositories/deliverySettlement.repository';
import { DeliverySettlement } from '../../shared/entities/deliverySettlement.entity';
import { User } from '../../shared/entities/user.entity';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';
import { StateTypeCode } from '../../shared/constants/stateTypeCode.enum';
import { APP_TIMEZONE } from '../../shared/constants/timezone';
import { SettlementPeriodType } from '../../shared/constants/settlementPeriodType.enum';
import { DeliveryPricingService } from '../../shared/services/delivery-pricing.service';
import {
  DeliverySettlementPeriodsParamsDto,
  MarkDeliverySettlementDto,
} from '../dtos/deliverySettlement.dto';

/** Totales de UNA quincena (unidad atómica) calculados desde pedidos entregados por el repartidor. */
interface QuincenaTotals {
  periodStart: string;
  ordersCount: number;
  deliveryTotal: number;
  mandaloCut: number;
  riderCut: number;
}

/** Fila que ve el admin: quincena (pagable) o mes/año (resumen). */
export interface DeliverySettlementPeriodItem {
  periodType: SettlementPeriodType;
  periodStart: string;
  periodEnd: string;
  ordersCount: number;
  deliveryTotal: number;
  mandaloCut: number;
  riderCut: number;
  /** Solo quincena: el pago real (se marca/desmarca). Null en mes/año. */
  settlement: {
    id: number;
    isPaid: boolean;
    paidAt: Date | null;
    notes: string | null;
    ordersCount: number;
    deliveryTotal: number;
    riderCut: number;
  } | null;
  /** Solo mes/año: cuántas de sus quincenas/meses ya están pagados. */
  paidSubperiods?: number;
  totalSubperiods?: number;
}

/**
 * Pagos de Mándalo a los repartidores (solo ADMIN) — espejo de
 * `SettlementService` pero en la dirección contraria de la plata: acá se
 * calcula cuánto le corresponde COBRAR a cada repartidor por sus domicilios
 * entregados (§42). Solo suma pedidos ENTREGADOS, agrupados en quincenas
 * (1–15 / 16–fin de mes, hora Colombia) — la única unidad pagable. El reparto
 * Mándalo/repartidor se reconstruye por pedido (no es lineal con la suma:
 * cada pedido tiene su propio tramo base/extra) con `DeliveryPricingService`.
 */
@Injectable()
export class DeliverySettlementService {
  constructor(
    private readonly _invoiceRepository: InvoiceRepository,
    private readonly _userRepository: UserRepository,
    private readonly _deliverySettlementRepository: DeliverySettlementRepository,
    private readonly _deliveryPricingService: DeliveryPricingService,
  ) {}

  // ---------- listado de períodos ----------

  async periods(
    user: User,
    params: DeliverySettlementPeriodsParamsDto,
  ): Promise<{ periods: DeliverySettlementPeriodItem[] }> {
    this.assertAdmin(user);
    await this.assertDeliveryUser(params.deliveryUserId);
    return this.buildPeriods(params.deliveryUserId, params.periodType);
  }

  /** "Mis pedidos" del propio repartidor (self-scoped, JWT — sin marcar pagos). */
  async myPeriods(
    user: User,
    periodType: SettlementPeriodType,
  ): Promise<{ periods: DeliverySettlementPeriodItem[] }> {
    if (user.roleType?.code !== RoleTypeCode.DELIVERY) {
      throw new ForbiddenException('Esta sección es solo para repartidores.');
    }
    return this.buildPeriods(user.id, periodType);
  }

  private async buildPeriods(
    deliveryUserId: string,
    periodType: SettlementPeriodType,
  ): Promise<{ periods: DeliverySettlementPeriodItem[] }> {
    const quincenaItems = await this.quincenaItems(deliveryUserId);
    if (periodType === SettlementPeriodType.QUINCENA) {
      return { periods: quincenaItems };
    }
    if (periodType === SettlementPeriodType.MONTH) {
      return { periods: this.rollUp(quincenaItems, 'month') };
    }
    return { periods: this.rollUp(quincenaItems, 'year') };
  }

  // ---------- marcar pagado / deshacer (SOLO quincena) ----------

  async mark(user: User, dto: MarkDeliverySettlementDto): Promise<DeliverySettlement> {
    this.assertAdmin(user);
    if (dto.periodType !== SettlementPeriodType.QUINCENA) {
      throw new BadRequestException('Solo se puede marcar el pago por quincena.');
    }
    await this.assertDeliveryUser(dto.deliveryUserId);

    const existing = await this._deliverySettlementRepository.findOne({
      where: {
        deliveryUserId: dto.deliveryUserId,
        periodType: SettlementPeriodType.QUINCENA,
        periodStart: dto.periodStart,
      },
    });

    if (!dto.isPaid) {
      if (!existing) {
        throw new BadRequestException('Esa quincena no tiene un pago registrado.');
      }
      existing.isPaid = false;
      existing.paidAt = null;
      if (dto.notes !== undefined) existing.notes = dto.notes;
      return this._deliverySettlementRepository.save(existing);
    }

    const totals = await this.aggregateQuincenas(dto.deliveryUserId, dto.periodStart);
    const row = totals[0];
    if (!row || !row.ordersCount) {
      throw new BadRequestException(
        'No hay entregas en esa quincena — no hay nada que pagar.',
      );
    }

    const settlement =
      existing ??
      this._deliverySettlementRepository.create({
        deliveryUserId: dto.deliveryUserId,
        periodType: SettlementPeriodType.QUINCENA,
        periodStart: dto.periodStart,
      });
    settlement.periodEnd = this.periodEnd(SettlementPeriodType.QUINCENA, dto.periodStart);
    settlement.ordersCount = row.ordersCount;
    settlement.deliveryTotal = row.deliveryTotal;
    settlement.mandaloCut = row.mandaloCut;
    settlement.riderCut = row.riderCut;
    settlement.isPaid = true;
    settlement.paidAt = new Date();
    if (dto.notes !== undefined) settlement.notes = dto.notes;

    return this._deliverySettlementRepository.save(settlement);
  }

  // ---------- helpers ----------

  private async quincenaItems(deliveryUserId: string): Promise<DeliverySettlementPeriodItem[]> {
    const totals = await this.aggregateQuincenas(deliveryUserId);
    const settlements = await this._deliverySettlementRepository.find({
      where: { deliveryUserId, periodType: SettlementPeriodType.QUINCENA },
    });
    const settlementByStart = new Map(settlements.map((s) => [s.periodStart, s]));

    const items = totals.map((row) =>
      this.toQuincenaItem(row, settlementByStart.get(row.periodStart) ?? null),
    );

    for (const settlement of settlements) {
      if (!totals.some((t) => t.periodStart === settlement.periodStart)) {
        items.push(
          this.toQuincenaItem(
            {
              periodStart: settlement.periodStart,
              ordersCount: 0,
              deliveryTotal: 0,
              mandaloCut: 0,
              riderCut: 0,
            },
            settlement,
          ),
        );
      }
    }
    items.sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));
    return items;
  }

  private toQuincenaItem(
    row: QuincenaTotals,
    settlement: DeliverySettlement | null,
  ): DeliverySettlementPeriodItem {
    return {
      periodType: SettlementPeriodType.QUINCENA,
      periodStart: row.periodStart,
      periodEnd: this.periodEnd(SettlementPeriodType.QUINCENA, row.periodStart),
      ordersCount: row.ordersCount,
      deliveryTotal: row.deliveryTotal,
      mandaloCut: row.mandaloCut,
      riderCut: row.riderCut,
      settlement: settlement
        ? {
            id: settlement.id,
            isPaid: settlement.isPaid,
            paidAt: settlement.paidAt ?? null,
            notes: settlement.notes ?? null,
            ordersCount: settlement.ordersCount,
            deliveryTotal: settlement.deliveryTotal,
            riderCut: settlement.riderCut,
          }
        : null,
    };
  }

  /** Igual que en `SettlementService`: junta quincenas en meses o años (resumen, no pagable). */
  private rollUp(
    quincenas: DeliverySettlementPeriodItem[],
    granularity: 'month' | 'year',
  ): DeliverySettlementPeriodItem[] {
    if (granularity === 'year') {
      const months = this.rollUp(quincenas, 'month');
      const byYear = new Map<
        string,
        { orders: number; delivery: number; mandalo: number; rider: number; paid: number; total: number }
      >();
      for (const m of months) {
        const year = m.periodStart.slice(0, 4);
        const acc =
          byYear.get(year) ?? { orders: 0, delivery: 0, mandalo: 0, rider: 0, paid: 0, total: 0 };
        acc.orders += m.ordersCount;
        acc.delivery += m.deliveryTotal;
        acc.mandalo += m.mandaloCut;
        acc.rider += m.riderCut;
        acc.total += 1;
        if (m.paidSubperiods === m.totalSubperiods && (m.totalSubperiods ?? 0) > 0) acc.paid += 1;
        byYear.set(year, acc);
      }
      return [...byYear.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([year, acc]) => {
          const periodStart = `${year}-01-01`;
          return {
            periodType: SettlementPeriodType.YEAR,
            periodStart,
            periodEnd: this.periodEnd(SettlementPeriodType.YEAR, periodStart),
            ordersCount: acc.orders,
            deliveryTotal: this.round2(acc.delivery),
            mandaloCut: this.round2(acc.mandalo),
            riderCut: this.round2(acc.rider),
            settlement: null,
            paidSubperiods: acc.paid,
            totalSubperiods: acc.total,
          };
        });
    }

    const byMonth = new Map<
      string,
      { orders: number; delivery: number; mandalo: number; rider: number; paid: number; total: number }
    >();
    for (const q of quincenas) {
      const month = q.periodStart.slice(0, 7);
      const acc =
        byMonth.get(month) ?? { orders: 0, delivery: 0, mandalo: 0, rider: 0, paid: 0, total: 0 };
      acc.orders += q.ordersCount;
      acc.delivery += q.deliveryTotal;
      acc.mandalo += q.mandaloCut;
      acc.rider += q.riderCut;
      acc.total += 1;
      if (q.settlement?.isPaid) acc.paid += 1;
      byMonth.set(month, acc);
    }
    return [...byMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([month, acc]) => {
        const periodStart = `${month}-01`;
        return {
          periodType: SettlementPeriodType.MONTH,
          periodStart,
          periodEnd: this.periodEnd(SettlementPeriodType.MONTH, periodStart),
          ordersCount: acc.orders,
          deliveryTotal: this.round2(acc.delivery),
          mandaloCut: this.round2(acc.mandalo),
          riderCut: this.round2(acc.rider),
          settlement: null,
          paidSubperiods: acc.paid,
          totalSubperiods: acc.total,
        };
      });
  }

  /**
   * Trae CADA pedido entregado por el repartidor (con su quincena y su
   * `deliveryFee`) y reparte Mándalo/repartidor POR PEDIDO — no se puede
   * sumar primero y repartir después: la fórmula tiene un tramo base fijo
   * por pedido, sumar rompería el cálculo. `onlyStart` limita a una quincena.
   */
  private async aggregateQuincenas(
    deliveryUserId: string,
    onlyStart?: string,
  ): Promise<QuincenaTotals[]> {
    const localDate = `invoice."deliveredAt" AT TIME ZONE '${APP_TIMEZONE}'`;
    const bucketExpr = `CASE WHEN EXTRACT(DAY FROM ${localDate}) <= 15
      THEN date_trunc('month', ${localDate})
      ELSE date_trunc('month', ${localDate}) + interval '15 days' END`;

    const query = this._invoiceRepository
      .createQueryBuilder('invoice')
      .innerJoin('invoice.stateType', 'stateType')
      .select(`to_char(${bucketExpr}, 'YYYY-MM-DD')`, 'periodStart')
      .addSelect('invoice."deliveryFee"', 'deliveryFee')
      .where('invoice."deliveryUserId" = :uid', { uid: deliveryUserId })
      .andWhere('stateType.code = :delivered', { delivered: StateTypeCode.DELIVERED })
      .andWhere('invoice."deliveredAt" IS NOT NULL');

    if (onlyStart) {
      query.andWhere(`${bucketExpr} = to_date(:onlyStart, 'YYYY-MM-DD')`, { onlyStart });
    }

    const rows = await query.getRawMany<{ periodStart: string; deliveryFee: string }>();

    const byStart = new Map<
      string,
      { ordersCount: number; deliveryTotal: number; mandaloCut: number; riderCut: number }
    >();
    for (const row of rows) {
      const fee = parseFloat(row.deliveryFee);
      const split = this._deliveryPricingService.splitFee(fee);
      const acc =
        byStart.get(row.periodStart) ??
        { ordersCount: 0, deliveryTotal: 0, mandaloCut: 0, riderCut: 0 };
      acc.ordersCount += 1;
      acc.deliveryTotal += fee;
      acc.mandaloCut += split.mandaloCut;
      acc.riderCut += split.riderCut;
      byStart.set(row.periodStart, acc);
    }

    return [...byStart.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([periodStart, acc]) => ({
        periodStart,
        ordersCount: acc.ordersCount,
        deliveryTotal: this.round2(acc.deliveryTotal),
        mandaloCut: this.round2(acc.mandaloCut),
        riderCut: this.round2(acc.riderCut),
      }));
  }

  private periodEnd(periodType: SettlementPeriodType, start: string): string {
    const [y, m, d] = start.split('-').map(Number);
    let end: Date;
    switch (periodType) {
      case SettlementPeriodType.QUINCENA:
        end =
          d === 1
            ? new Date(Date.UTC(y, m - 1, 15))
            : new Date(Date.UTC(y, m, 0));
        break;
      case SettlementPeriodType.MONTH:
        end = new Date(Date.UTC(y, m, 0));
        break;
      case SettlementPeriodType.YEAR:
        end = new Date(Date.UTC(y, 11, 31));
        break;
    }
    return end.toISOString().slice(0, 10);
  }

  private async assertDeliveryUser(id: string): Promise<void> {
    const user = await this._userRepository.findOne({
      where: { id },
      relations: ['roleType'],
    });
    if (!user || user.roleType?.code !== RoleTypeCode.DELIVERY) {
      throw new NotFoundException('Repartidor no encontrado');
    }
  }

  private assertAdmin(user: User): void {
    if (user.roleType?.code !== RoleTypeCode.ADMIN) {
      throw new ForbiddenException('Solo el administrador puede gestionar los pagos.');
    }
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
