import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceRepository } from '../../shared/repositories/invoice.repository';
import { OrganizationalRepository } from '../../shared/repositories/organizational.repository';
import { BusinessSettlementRepository } from '../../shared/repositories/businessSettlement.repository';
import { BusinessSettlement } from '../../shared/entities/businessSettlement.entity';
import { User } from '../../shared/entities/user.entity';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';
import { StateTypeCode } from '../../shared/constants/stateTypeCode.enum';
import { APP_TIMEZONE } from '../../shared/constants/timezone';
import {
  MarkSettlementDto,
  SettlementPeriodType,
  SettlementPeriodsParamsDto,
} from '../dtos/settlement.dto';

/** Totales de un período calculados desde los pedidos ENTREGADOS. */
interface PeriodTotals {
  periodStart: string;
  ordersCount: number;
  salesTotal: number;
  deliveryTotal: number;
}

/** Fila que ve el admin: totales vigentes + comisión + estado del cobro. */
export interface SettlementPeriodItem extends PeriodTotals {
  periodType: SettlementPeriodType;
  periodEnd: string;
  orderCommissionRate: number;
  deliveryCommissionRate: number;
  orderCommission: number;
  deliveryCommission: number;
  commissionTotal: number;
  settlement: {
    id: number;
    isPaid: boolean;
    paidAt: Date | null;
    notes: string | null;
    // Snapshot de lo que se cobró (puede diferir de lo vigente si entraron
    // entregas después del cobro — el front lo señala).
    ordersCount: number;
    salesTotal: number;
    deliveryTotal: number;
    commissionTotal: number;
  } | null;
}

/**
 * Cobros de la plataforma a los negocios (solo ADMIN). Solo suman los pedidos
 * ENTREGADOS, agrupados por su deliveredAt en hora Colombia. La comisión es
 * % sobre lo vendido (subtotal) + % sobre los domicilios — toda la plata se
 * trata con el negocio, al repartidor no se le cobra nada.
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly _invoiceRepository: InvoiceRepository,
    private readonly _organizationalRepository: OrganizationalRepository,
    private readonly _businessSettlementRepository: BusinessSettlementRepository,
    private readonly _configService: ConfigService,
  ) {}

  /** Tasas vigentes (APP_COMMISSION_ORDER_RATE / APP_COMMISSION_DELIVERY_RATE). */
  getRates(): { orderRate: number; deliveryRate: number } {
    return {
      orderRate:
        this._configService.get<number>('app.commissionOrderRate') ?? 5,
      deliveryRate:
        this._configService.get<number>('app.commissionDeliveryRate') ?? 20,
    };
  }

  // ---------- listado de períodos ----------

  async periods(
    user: User,
    params: SettlementPeriodsParamsDto,
  ): Promise<{
    orderRate: number;
    deliveryRate: number;
    periods: SettlementPeriodItem[];
  }> {
    this.assertAdmin(user);
    await this.assertOrganizational(params.organizationalId);

    const totals = await this.aggregatePeriods(
      params.organizationalId,
      params.periodType,
    );

    const settlements = await this._businessSettlementRepository.find({
      where: {
        organizationalId: params.organizationalId,
        periodType: params.periodType,
      },
    });
    const settlementByStart = new Map(
      settlements.map((s) => [s.periodStart, s]),
    );

    const { orderRate, deliveryRate } = this.getRates();
    const periods = totals.map((row) =>
      this.toPeriodItem(
        row,
        params.periodType,
        orderRate,
        deliveryRate,
        settlementByStart.get(row.periodStart) ?? null,
      ),
    );

    // Períodos ya cobrados cuyos pedidos desaparecieron del agregado (p. ej.
    // se borró el negocio de los invoices no aplica por CASCADE, pero sí
    // queda el caso de cobros históricos sin filas nuevas): se conservan.
    for (const settlement of settlements) {
      if (!totals.some((t) => t.periodStart === settlement.periodStart)) {
        periods.push(
          this.toPeriodItem(
            {
              periodStart: settlement.periodStart,
              ordersCount: 0,
              salesTotal: 0,
              deliveryTotal: 0,
            },
            params.periodType,
            orderRate,
            deliveryRate,
            settlement,
          ),
        );
      }
    }
    periods.sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1));

    return { orderRate, deliveryRate, periods };
  }

  // ---------- marcar cobrado / deshacer ----------

  async mark(user: User, dto: MarkSettlementDto): Promise<BusinessSettlement> {
    this.assertAdmin(user);
    await this.assertOrganizational(dto.organizationalId);

    const existing = await this._businessSettlementRepository.findOne({
      where: {
        organizationalId: dto.organizationalId,
        periodType: dto.periodType,
        periodStart: dto.periodStart,
      },
    });

    if (!dto.isPaid) {
      // Deshacer el cobro: se conserva el snapshot por trazabilidad.
      if (!existing) {
        throw new BadRequestException(
          'Ese período no tiene un cobro registrado.',
        );
      }
      existing.isPaid = false;
      existing.paidAt = null;
      if (dto.notes !== undefined) existing.notes = dto.notes;
      return this._businessSettlementRepository.save(existing);
    }

    // Cobrar: se recalcula el período en el server y se guarda el snapshot.
    const totals = await this.aggregatePeriods(
      dto.organizationalId,
      dto.periodType,
      dto.periodStart,
    );
    const row = totals[0];
    if (!row || !row.ordersCount) {
      throw new BadRequestException(
        'No hay pedidos entregados en ese período — no hay nada que cobrar.',
      );
    }

    const { orderRate, deliveryRate } = this.getRates();
    const commissionTotal = this.round2(
      this.round2((row.salesTotal * orderRate) / 100) +
        this.round2((row.deliveryTotal * deliveryRate) / 100),
    );

    const settlement =
      existing ??
      this._businessSettlementRepository.create({
        organizationalId: dto.organizationalId,
        periodType: dto.periodType,
        periodStart: dto.periodStart,
      });
    settlement.periodEnd = this.periodEnd(dto.periodType, dto.periodStart);
    settlement.ordersCount = row.ordersCount;
    settlement.salesTotal = row.salesTotal;
    settlement.deliveryTotal = row.deliveryTotal;
    settlement.orderCommissionRate = orderRate;
    settlement.deliveryCommissionRate = deliveryRate;
    settlement.commissionTotal = commissionTotal;
    settlement.isPaid = true;
    settlement.paidAt = new Date();
    if (dto.notes !== undefined) settlement.notes = dto.notes;

    return this._businessSettlementRepository.save(settlement);
  }

  // ---------- helpers ----------

  /**
   * Suma los pedidos ENTREGADOS del negocio agrupados por período (semana ISO
   * / mes / año del deliveredAt en hora Colombia). `onlyStart` limita a un
   * único período (para el cobro).
   */
  private async aggregatePeriods(
    organizationalId: number,
    periodType: SettlementPeriodType,
    onlyStart?: string,
  ): Promise<PeriodTotals[]> {
    // `periodType` viene validado por enum — seguro para interpolar.
    const truncExpr = `date_trunc('${periodType}', invoice."deliveredAt" AT TIME ZONE '${APP_TIMEZONE}')`;

    const query = this._invoiceRepository
      .createQueryBuilder('invoice')
      .innerJoin('invoice.stateType', 'stateType')
      .select(`to_char(${truncExpr}, 'YYYY-MM-DD')`, 'periodStart')
      .addSelect('COUNT(*)::int', 'ordersCount')
      .addSelect('COALESCE(SUM(invoice."subtotal"), 0)', 'salesTotal')
      .addSelect('COALESCE(SUM(invoice."deliveryFee"), 0)', 'deliveryTotal')
      .where('invoice."organizationalId" = :oid', { oid: organizationalId })
      .andWhere('stateType.code = :delivered', {
        delivered: StateTypeCode.DELIVERED,
      })
      .andWhere('invoice."deliveredAt" IS NOT NULL')
      .groupBy(truncExpr)
      .orderBy(truncExpr, 'DESC');

    if (onlyStart) {
      query.having(`to_char(${truncExpr}, 'YYYY-MM-DD') = :onlyStart`, {
        onlyStart,
      });
    }

    const rows = await query.getRawMany<{
      periodStart: string;
      ordersCount: number;
      salesTotal: string;
      deliveryTotal: string;
    }>();

    return rows.map((row) => ({
      periodStart: row.periodStart,
      ordersCount: Number(row.ordersCount),
      salesTotal: this.round2(parseFloat(row.salesTotal)),
      deliveryTotal: this.round2(parseFloat(row.deliveryTotal)),
    }));
  }

  private toPeriodItem(
    row: PeriodTotals,
    periodType: SettlementPeriodType,
    orderRate: number,
    deliveryRate: number,
    settlement: BusinessSettlement | null,
  ): SettlementPeriodItem {
    const orderCommission = this.round2((row.salesTotal * orderRate) / 100);
    const deliveryCommission = this.round2(
      (row.deliveryTotal * deliveryRate) / 100,
    );
    return {
      ...row,
      periodType,
      periodEnd: this.periodEnd(periodType, row.periodStart),
      orderCommissionRate: orderRate,
      deliveryCommissionRate: deliveryRate,
      orderCommission,
      deliveryCommission,
      commissionTotal: this.round2(orderCommission + deliveryCommission),
      settlement: settlement
        ? {
            id: settlement.id,
            isPaid: settlement.isPaid,
            paidAt: settlement.paidAt ?? null,
            notes: settlement.notes ?? null,
            ordersCount: settlement.ordersCount,
            salesTotal: settlement.salesTotal,
            deliveryTotal: settlement.deliveryTotal,
            commissionTotal: settlement.commissionTotal,
          }
        : null,
    };
  }

  /** Último día (inclusive, fecha local) del período que arranca en `start`. */
  private periodEnd(periodType: SettlementPeriodType, start: string): string {
    const [y, m, d] = start.split('-').map(Number);
    let end: Date;
    switch (periodType) {
      case SettlementPeriodType.WEEK:
        end = new Date(Date.UTC(y, m - 1, d + 6));
        break;
      case SettlementPeriodType.MONTH:
        end = new Date(Date.UTC(y, m, 0)); // día 0 del mes siguiente
        break;
      case SettlementPeriodType.YEAR:
        end = new Date(Date.UTC(y, 11, 31));
        break;
    }
    return end.toISOString().slice(0, 10);
  }

  private async assertOrganizational(id: number): Promise<void> {
    const org = await this._organizationalRepository.findOne({
      where: { id },
    });
    if (!org) throw new NotFoundException('Negocio no encontrado');
  }

  private assertAdmin(user: User): void {
    if (user.roleType?.code !== RoleTypeCode.ADMIN) {
      throw new ForbiddenException(
        'Solo el administrador puede gestionar los cobros.',
      );
    }
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
