import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRepository } from '../../shared/repositories/user.repository';
import { OrganizationalRepository } from '../../shared/repositories/organizational.repository';
import { InvoiceRepository } from '../../shared/repositories/invoice.repository';
import { ProductRepository } from '../../shared/repositories/product.repository';
import { User } from '../../shared/entities/user.entity';
import { RoleTypeCode, isAdminRole } from '../../shared/roles/roleTypeCode.enum';
import { StateTypeCode } from '../../shared/constants/stateTypeCode.enum';
import {
  applyMunicipalityScope,
  scopeMunicipalityIdFor,
} from '../../shared/utils/municipality-scope.util';

export type AdminDashboardStats = {
  users: number;
  businesses: number;
  deliveries: number;
  pendingDeliveries: number;
  pendingOrders: number;
  activeOrders: number;
  serviceFeeTotal: number;
};

/**
 * `pendingOrders` NO viaja acá: en el panel del negocio ya se comparte con el
 * badge del sidebar (`usePendingOrdersCount`, en vivo por socket) — traerlo
 * también acá sería la misma petición dos veces (auditoría de peticiones).
 */
export type BusinessDashboardStats = {
  activeOrders: number;
  deliveredOrders: number;
  products: number;
};

const ACTIVE_ORDER_CODES = [
  StateTypeCode.PENDING,
  StateTypeCode.ACCEPTED,
  StateTypeCode.PREPARING,
  StateTypeCode.ON_ROUTE,
];

/**
 * Contadores de los dashboards (admin/negocio): antes cada tarjeta hacía su
 * propia petición a `/invoice/paginated`/`/user/paginated` con `perPage=1`
 * solo para leer `pagination.total` — acá se junta todo en una sola consulta
 * por pantalla (auditoría de peticiones, ver NOTAS).
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly _userRepository: UserRepository,
    private readonly _organizationalRepository: OrganizationalRepository,
    private readonly _invoiceRepository: InvoiceRepository,
    private readonly _productRepository: ProductRepository,
  ) {}

  async adminStats(user: User): Promise<AdminDashboardStats> {
    if (!isAdminRole(user.roleType?.code)) {
      throw new ForbiddenException(
        'No tienes permiso para ver estas estadísticas.',
      );
    }
    // Admin regional: los 7 conteos se escopan a SU municipio; SUPERADMIN
    // los ve como siempre, sin filtro.
    const muniId = scopeMunicipalityIdFor(user);

    const businessesQuery = this._organizationalRepository
      .createQueryBuilder('organizational')
      .select('COUNT(*)::int', 'count');
    applyMunicipalityScope(businessesQuery, 'organizational', muniId);

    const [
      users,
      businessesRow,
      deliveries,
      pendingDeliveries,
      pendingOrders,
      activeOrders,
      serviceFeeRow,
    ] = await Promise.all([
      this.countByRole(RoleTypeCode.CLIENT, undefined, muniId),
      businessesQuery.getRawOne<{ count: number }>(),
      this.countByRole(RoleTypeCode.DELIVERY, undefined, muniId),
      this.countByRole(RoleTypeCode.DELIVERY, { isActive: false }, muniId),
      this.countByState([StateTypeCode.PENDING], undefined, muniId),
      this.countByState(ACTIVE_ORDER_CODES, undefined, muniId),
      (() => {
        const q = this._invoiceRepository
          .createQueryBuilder('invoice')
          .innerJoin('invoice.stateType', 'stateType')
          .innerJoin('invoice.organizational', 'organizational')
          .select('COALESCE(SUM(invoice."serviceFee"), 0)', 'total')
          .where('stateType.code = :delivered', {
            delivered: StateTypeCode.DELIVERED,
          });
        applyMunicipalityScope(q, 'organizational', muniId);
        return q.getRawOne<{ total: string }>();
      })(),
    ]);
    const businesses = Number(businessesRow?.count ?? 0);

    return {
      users,
      businesses,
      deliveries,
      pendingDeliveries,
      pendingOrders,
      activeOrders,
      serviceFeeTotal: this.round2(parseFloat(serviceFeeRow?.total ?? '0')),
    };
  }

  async businessStats(user: User): Promise<BusinessDashboardStats> {
    this.assertRole(user, RoleTypeCode.BUSINESS);
    const org = await this._organizationalRepository.findOne({
      where: { legalPersonId: user.id },
    });
    if (!org) {
      throw new NotFoundException(
        'Tu cuenta no tiene un negocio asociado. Contacta al administrador.',
      );
    }

    const [activeOrders, deliveredOrders, products] = await Promise.all([
      this.countByState(
        [
          StateTypeCode.ACCEPTED,
          StateTypeCode.PREPARING,
          StateTypeCode.ON_ROUTE,
        ],
        org.id,
      ),
      this.countByState([StateTypeCode.DELIVERED], org.id),
      this._productRepository.count({ where: { organizationalId: org.id } }),
    ]);

    return { activeOrders, deliveredOrders, products };
  }

  // ---------- helpers ----------

  /** `municipalityId`: solo lo manda `adminStats` (CLIENT/DELIVERY, directo). */
  private async countByRole(
    role: RoleTypeCode,
    extra?: { isActive?: boolean },
    municipalityId?: number | null,
  ): Promise<number> {
    const query = this._userRepository
      .createQueryBuilder('user')
      .innerJoin('user.roleType', 'roleType')
      .where('roleType.code = :role', { role });
    if (extra?.isActive !== undefined) {
      query.andWhere('user.isActive = :isActive', {
        isActive: extra.isActive,
      });
    }
    applyMunicipalityScope(query, 'user', municipalityId);
    return query.getCount();
  }

  /**
   * `organizationalId`: negocio puntual (dashboard del NEGOCIO).
   * `municipalityId`: alcance del admin regional (dashboard ADMIN) — join
   * aparte porque acá no hay un negocio puntual, se compara el del pedido.
   */
  private async countByState(
    codes: StateTypeCode[],
    organizationalId?: number,
    municipalityId?: number | null,
  ): Promise<number> {
    const query = this._invoiceRepository
      .createQueryBuilder('invoice')
      .innerJoin('invoice.stateType', 'stateType')
      .where('stateType.code IN (:...codes)', { codes });
    if (organizationalId !== undefined) {
      query.andWhere('invoice."organizationalId" = :oid', {
        oid: organizationalId,
      });
    }
    if (municipalityId != null) {
      query.innerJoin('invoice.organizational', 'organizational');
      applyMunicipalityScope(query, 'organizational', municipalityId);
    }
    return query.getCount();
  }

  private assertRole(user: User, role: RoleTypeCode): void {
    if (user.roleType?.code !== role) {
      throw new ForbiddenException(
        'No tienes permiso para ver estas estadísticas.',
      );
    }
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
