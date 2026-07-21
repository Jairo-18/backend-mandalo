import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceRepository } from '../../shared/repositories/invoice.repository';
import { OrganizationalRepository } from '../../shared/repositories/organizational.repository';
import { BusinessSettlementRepository } from '../../shared/repositories/businessSettlement.repository';
import { BusinessSettlement } from '../../shared/entities/businessSettlement.entity';
import { Organizational } from '../../shared/entities/organizational.entity';
import { User } from '../../shared/entities/user.entity';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';
import { StateTypeCode } from '../../shared/constants/stateTypeCode.enum';
import { APP_TIMEZONE } from '../../shared/constants/timezone';
import { SettlementPeriodType } from '../../shared/constants/settlementPeriodType.enum';
import { MarkSettlementDto, SettlementPeriodsParamsDto } from '../dtos/settlement.dto';

/** Totales de UNA quincena (unidad atómica) calculados desde pedidos ENTREGADOS. */
interface QuincenaTotals {
  periodStart: string; // YYYY-MM-DD, día 1 o 16 del mes (hora Colombia)
  ordersCount: number;
  salesTotal: number;
}

/** Fila que ve el admin: quincena (cobrable) o mes/año (resumen). */
export interface SettlementPeriodItem {
  periodType: SettlementPeriodType;
  periodStart: string;
  periodEnd: string;
  ordersCount: number;
  salesTotal: number;
  commissionRate: number;
  commissionTotal: number;
  /** Solo quincena: el cobro real (se marca/desmarca). Null en mes/año. */
  settlement: {
    id: number;
    isPaid: boolean;
    paidAt: Date | null;
    notes: string | null;
    ordersCount: number;
    salesTotal: number;
    commissionTotal: number;
  } | null;
  /** Solo mes/año: cuántas de sus quincenas/meses ya están cobrados. */
  paidSubperiods?: number;
  totalSubperiods?: number;
}

/**
 * Cobros de la plataforma a los negocios (solo ADMIN). Solo suman los pedidos
 * ENTREGADOS, agrupados en quincenas (1–15 y 16–fin de mes, hora Colombia) —
 * la ÚNICA unidad que se marca cobrada/pendiente. Mes y año son resúmenes que
 * se arman sumando sus quincenas. La comisión es % sobre lo vendido
 * (subtotal), la tasa vigente de CADA negocio (organizational.commissionOrderRate,
 * la sube el admin a mano de 5% a 12%). El domicilio no se cobra al negocio
 * (se reparte 100% entre Mándalo y el repartidor, ver DeliveryPricingService).
 */
@Injectable()
export class SettlementService {
  constructor(
    private readonly _invoiceRepository: InvoiceRepository,
    private readonly _organizationalRepository: OrganizationalRepository,
    private readonly _businessSettlementRepository: BusinessSettlementRepository,
  ) {}

  // ---------- listado de períodos ----------

  async periods(
    user: User,
    params: SettlementPeriodsParamsDto,
  ): Promise<{ commissionRate: number; periods: SettlementPeriodItem[] }> {
    this.assertAdmin(user);
    const organizational = await this.getOrganizational(params.organizationalId);
    return this.buildPeriods(organizational, params.periodType);
  }

  /** "Mis pedidos" del propio negocio (self-scoped por JWT, rol NEGO — sin marcar cobros). */
  async myPeriods(
    user: User,
    periodType: SettlementPeriodType,
  ): Promise<{ commissionRate: number; periods: SettlementPeriodItem[] }> {
    const organizational = await this._organizationalRepository.findOne({
      where: { legalPersonId: user.id },
    });
    if (!organizational) {
      throw new NotFoundException(
        'Tu cuenta no tiene un negocio asociado. Contacta al administrador.',
      );
    }
    return this.buildPeriods(organizational, periodType);
  }

  private async buildPeriods(
    organizational: Organizational,
    periodType: SettlementPeriodType,
  ): Promise<{ commissionRate: number; periods: SettlementPeriodItem[] }> {
    const rate = organizational.commissionOrderRate;
    const quincenaItems = await this.quincenaItems(organizational.id, rate);

    if (periodType === SettlementPeriodType.QUINCENA) {
      return { commissionRate: rate, periods: quincenaItems };
    }
    if (periodType === SettlementPeriodType.MONTH) {
      return { commissionRate: rate, periods: this.rollUp(quincenaItems, 'month', rate) };
    }
    return { commissionRate: rate, periods: this.rollUp(quincenaItems, 'year', rate) };
  }

  // ---------- marcar cobrado / deshacer (SOLO quincena) ----------

  async mark(user: User, dto: MarkSettlementDto): Promise<BusinessSettlement> {
    this.assertAdmin(user);
    if (dto.periodType !== SettlementPeriodType.QUINCENA) {
      throw new BadRequestException('Solo se puede marcar el cobro por quincena.');
    }
    const organizational = await this.getOrganizational(dto.organizationalId);

    const existing = await this._businessSettlementRepository.findOne({
      where: {
        organizationalId: dto.organizationalId,
        periodType: SettlementPeriodType.QUINCENA,
        periodStart: dto.periodStart,
      },
    });

    if (!dto.isPaid) {
      if (!existing) {
        throw new BadRequestException('Esa quincena no tiene un cobro registrado.');
      }
      existing.isPaid = false;
      existing.paidAt = null;
      if (dto.notes !== undefined) existing.notes = dto.notes;
      return this._businessSettlementRepository.save(existing);
    }

    const totals = await this.aggregateQuincenas(dto.organizationalId, dto.periodStart);
    const row = totals[0];
    if (!row || !row.ordersCount) {
      throw new BadRequestException(
        'No hay pedidos entregados en esa quincena — no hay nada que cobrar.',
      );
    }

    const rate = organizational.commissionOrderRate;
    const commissionTotal = this.round2((row.salesTotal * rate) / 100);

    const settlement =
      existing ??
      this._businessSettlementRepository.create({
        organizationalId: dto.organizationalId,
        periodType: SettlementPeriodType.QUINCENA,
        periodStart: dto.periodStart,
      });
    settlement.periodEnd = this.periodEnd(SettlementPeriodType.QUINCENA, dto.periodStart);
    settlement.ordersCount = row.ordersCount;
    settlement.salesTotal = row.salesTotal;
    settlement.deliveryTotal = 0;
    settlement.orderCommissionRate = rate;
    settlement.deliveryCommissionRate = 0;
    settlement.commissionTotal = commissionTotal;
    settlement.isPaid = true;
    settlement.paidAt = new Date();
    if (dto.notes !== undefined) settlement.notes = dto.notes;

    return this._businessSettlementRepository.save(settlement);
  }

  // ---------- helpers ----------

  private async quincenaItems(
    organizationalId: number,
    rate: number,
  ): Promise<SettlementPeriodItem[]> {
    const totals = await this.aggregateQuincenas(organizationalId);
    const settlements = await this._businessSettlementRepository.find({
      where: { organizationalId, periodType: SettlementPeriodType.QUINCENA },
    });
    const settlementByStart = new Map(settlements.map((s) => [s.periodStart, s]));

    const items = totals.map((row) => this.toQuincenaItem(row, rate, settlementByStart.get(row.periodStart) ?? null));

    // Quincenas ya cobradas cuyos pedidos desaparecieron del agregado (caso
    // raro: cobros históricos sin filas nuevas) — se conservan igual.
    for (const settlement of settlements) {
      if (!totals.some((t) => t.periodStart === settlement.periodStart)) {
        items.push(
          this.toQuincenaItem(
            { periodStart: settlement.periodStart, ordersCount: 0, salesTotal: 0 },
            rate,
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
    rate: number,
    settlement: BusinessSettlement | null,
  ): SettlementPeriodItem {
    const commissionTotal = this.round2((row.salesTotal * rate) / 100);
    return {
      periodType: SettlementPeriodType.QUINCENA,
      periodStart: row.periodStart,
      periodEnd: this.periodEnd(SettlementPeriodType.QUINCENA, row.periodStart),
      ordersCount: row.ordersCount,
      salesTotal: row.salesTotal,
      commissionRate: rate,
      commissionTotal,
      settlement: settlement
        ? {
            id: settlement.id,
            isPaid: settlement.isPaid,
            paidAt: settlement.paidAt ?? null,
            notes: settlement.notes ?? null,
            ordersCount: settlement.ordersCount,
            salesTotal: settlement.salesTotal,
            commissionTotal: settlement.commissionTotal,
          }
        : null,
    };
  }

  /**
   * Junta las quincenas en meses o años: suma totales/comisión y cuenta
   * cuántas de sus quincenas (mes) o meses (año) ya están cobrados — el "mes"
   * y el "año" no son cobrables por sí solos, solo informan.
   */
  private rollUp(
    quincenas: SettlementPeriodItem[],
    granularity: 'month' | 'year',
    rate: number,
  ): SettlementPeriodItem[] {
    // Para "año" primero se junta por mes (para contar meses pagados = sus 2
    // quincenas pagadas), y ESE resultado se vuelve a juntar por año.
    if (granularity === 'year') {
      const months = this.rollUp(quincenas, 'month', rate);
      const byYear = new Map<string, { orders: number; sales: number; paid: number; total: number }>();
      for (const m of months) {
        const year = m.periodStart.slice(0, 4);
        const acc = byYear.get(year) ?? { orders: 0, sales: 0, paid: 0, total: 0 };
        acc.orders += m.ordersCount;
        acc.sales += m.salesTotal;
        acc.total += 1;
        if (m.paidSubperiods === m.totalSubperiods && (m.totalSubperiods ?? 0) > 0) acc.paid += 1;
        byYear.set(year, acc);
      }
      return [...byYear.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([year, acc]) => {
          const periodStart = `${year}-01-01`;
          const commissionTotal = this.round2((acc.sales * rate) / 100);
          return {
            periodType: SettlementPeriodType.YEAR,
            periodStart,
            periodEnd: this.periodEnd(SettlementPeriodType.YEAR, periodStart),
            ordersCount: acc.orders,
            salesTotal: this.round2(acc.sales),
            commissionRate: rate,
            commissionTotal,
            settlement: null,
            paidSubperiods: acc.paid,
            totalSubperiods: acc.total,
          };
        });
    }

    const byMonth = new Map<string, { orders: number; sales: number; paid: number; total: number }>();
    for (const q of quincenas) {
      const month = q.periodStart.slice(0, 7); // YYYY-MM
      const acc = byMonth.get(month) ?? { orders: 0, sales: 0, paid: 0, total: 0 };
      acc.orders += q.ordersCount;
      acc.sales += q.salesTotal;
      acc.total += 1;
      if (q.settlement?.isPaid) acc.paid += 1;
      byMonth.set(month, acc);
    }
    return [...byMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([month, acc]) => {
        const periodStart = `${month}-01`;
        const commissionTotal = this.round2((acc.sales * rate) / 100);
        return {
          periodType: SettlementPeriodType.MONTH,
          periodStart,
          periodEnd: this.periodEnd(SettlementPeriodType.MONTH, periodStart),
          ordersCount: acc.orders,
          salesTotal: this.round2(acc.sales),
          commissionRate: rate,
          commissionTotal,
          settlement: null,
          paidSubperiods: acc.paid,
          totalSubperiods: acc.total,
        };
      });
  }

  /**
   * Suma los pedidos ENTREGADOS del negocio agrupados por quincena (1–15 /
   * 16–fin de mes) del `deliveredAt` en hora Colombia. `onlyStart` limita a
   * una única quincena (para el cobro).
   */
  private async aggregateQuincenas(
    organizationalId: number,
    onlyStart?: string,
  ): Promise<QuincenaTotals[]> {
    const localDate = `invoice."deliveredAt" AT TIME ZONE '${APP_TIMEZONE}'`;
    // Día 1 del mes si la fecha es <=15, día 16 si no.
    const bucketExpr = `CASE WHEN EXTRACT(DAY FROM ${localDate}) <= 15
      THEN date_trunc('month', ${localDate})
      ELSE date_trunc('month', ${localDate}) + interval '15 days' END`;

    const query = this._invoiceRepository
      .createQueryBuilder('invoice')
      .innerJoin('invoice.stateType', 'stateType')
      .select(`to_char(${bucketExpr}, 'YYYY-MM-DD')`, 'periodStart')
      .addSelect('COUNT(*)::int', 'ordersCount')
      .addSelect('COALESCE(SUM(invoice."subtotal"), 0)', 'salesTotal')
      .where('invoice."organizationalId" = :oid', { oid: organizationalId })
      .andWhere('stateType.code = :delivered', { delivered: StateTypeCode.DELIVERED })
      .andWhere('invoice."deliveredAt" IS NOT NULL')
      .groupBy(bucketExpr)
      .orderBy(bucketExpr, 'DESC');

    if (onlyStart) {
      query.having(`to_char(${bucketExpr}, 'YYYY-MM-DD') = :onlyStart`, { onlyStart });
    }

    const rows = await query.getRawMany<{
      periodStart: string;
      ordersCount: number;
      salesTotal: string;
    }>();

    return rows.map((row) => ({
      periodStart: row.periodStart,
      ordersCount: Number(row.ordersCount),
      salesTotal: this.round2(parseFloat(row.salesTotal)),
    }));
  }

  /** Último día (inclusive, fecha local) del período que arranca en `start`. */
  private periodEnd(periodType: SettlementPeriodType, start: string): string {
    const [y, m, d] = start.split('-').map(Number);
    let end: Date;
    switch (periodType) {
      case SettlementPeriodType.QUINCENA:
        end =
          d === 1
            ? new Date(Date.UTC(y, m - 1, 15))
            : new Date(Date.UTC(y, m, 0)); // día 0 del mes siguiente = último día del actual
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

  private async getOrganizational(id: number): Promise<Organizational> {
    const org = await this._organizationalRepository.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Negocio no encontrado');
    return org;
  }

  private assertAdmin(user: User): void {
    if (user.roleType?.code !== RoleTypeCode.ADMIN) {
      throw new ForbiddenException('Solo el administrador puede gestionar los cobros.');
    }
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
