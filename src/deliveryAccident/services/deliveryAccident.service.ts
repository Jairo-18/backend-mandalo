import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryAccidentRepository } from '../../shared/repositories/deliveryAccident.repository';
import { InvoiceRepository } from '../../shared/repositories/invoice.repository';
import { AppSettingsRepository } from '../../shared/repositories/appSettings.repository';
import { DeliveryAccident } from '../../shared/entities/deliveryAccident.entity';
import { User } from '../../shared/entities/user.entity';
import { RoleTypeCode, isAdminRole } from '../../shared/roles/roleTypeCode.enum';
import { PushService } from '../../shared/services/push.service';
import { LocalStorageService } from '../../localStorage/services/localStorage.service';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import { PageMetaDto } from '../../shared/dtos/pageMeta.dto';
import {
  applyMunicipalityScope,
  isOutsideMunicipalityScope,
  scopeMunicipalityIdFor,
} from '../../shared/utils/municipality-scope.util';
import {
  PaginatedAccidentsParamsDto,
  ReportAccidentDto,
} from '../dtos/deliveryAccident.dto';

const MAX_PHOTOS = 5;

/**
 * Reportes de accidente de repartidores (reunión con el cliente 2026-08-04):
 * el repartidor reporta (foto obligatoria) y el admin los revisa desde un
 * panel nuevo. Es un registro de SEGURIDAD independiente del pedido — no lo
 * cancela ni lo cambia de estado.
 */
@Injectable()
export class DeliveryAccidentService {
  constructor(
    private readonly _accidentRepository: DeliveryAccidentRepository,
    private readonly _invoiceRepository: InvoiceRepository,
    private readonly _appSettingsRepository: AppSettingsRepository,
    private readonly _localStorageService: LocalStorageService,
    private readonly _pushService: PushService,
  ) {}

  /** El repartidor reporta un accidente sobre un pedido que tiene/tuvo asignado. */
  async report(
    user: User,
    dto: ReportAccidentDto,
    files: Express.Multer.File[],
  ): Promise<{ arlCompanyName: string | null; arlPolicyNumber: string | null; arlIndividualNumber: string | null }> {
    if (user.roleType?.code !== RoleTypeCode.DELIVERY) {
      throw new ForbiddenException('Solo los repartidores pueden reportar esto.');
    }
    const invoice = await this._invoiceRepository.findOne({
      where: { id: dto.invoiceId },
    });
    if (!invoice) throw new NotFoundException('Pedido no encontrado');
    if (invoice.deliveryUserId !== user.id) {
      throw new ForbiddenException('Este pedido no es tuyo.');
    }
    if (!files?.length) {
      throw new BadRequestException(
        'Toma al menos una foto del accidente/sitio.',
      );
    }
    if (files.length > MAX_PHOTOS) {
      throw new BadRequestException(`Máximo ${MAX_PHOTOS} fotos.`);
    }

    const photos: string[] = [];
    for (const file of files) {
      const { imageUrl } = await this._localStorageService.saveImage(
        file,
        'delivery-failures',
      );
      photos.push(imageUrl);
    }

    const accident = this._accidentRepository.create({
      deliveryUserId: user.id,
      invoiceId: invoice.id,
      reasonCode: dto.reasonCode,
      notes: dto.notes ?? null,
      photos,
      incidentAt: new Date(),
    });
    await this._accidentRepository.save(accident);

    void this._pushService.sendToAdmins({
      title: '🚨 Un repartidor reportó un accidente',
      body: `${user.fullName} reportó "${dto.reasonCode}" en el pedido #${invoice.id}.`,
      data: { type: 'accident', accidentId: accident.id },
    });

    const settings = await this._appSettingsRepository.findOne({
      where: { id: 1 },
    });
    return {
      arlCompanyName: settings?.arlCompanyName ?? null,
      arlPolicyNumber: settings?.arlPolicyNumber ?? null,
      arlIndividualNumber: user.arlIndividualNumber ?? null,
    };
  }

  /** Listado paginado (solo ADMIN) — más recientes primero, pendientes destacados. */
  async paginated(
    user: User,
    params: PaginatedAccidentsParamsDto,
  ): Promise<ResponsePaginationDto<DeliveryAccident>> {
    this.assertAdmin(user);
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 10;

    const query = this._accidentRepository
      .createQueryBuilder('accident')
      .leftJoinAndSelect('accident.deliveryUser', 'deliveryUser')
      .leftJoinAndSelect('accident.invoice', 'invoice')
      .leftJoin('invoice.organizational', 'organizational')
      .orderBy('accident.reviewedAt', 'ASC', 'NULLS FIRST')
      .addOrderBy('accident.createdAt', 'DESC')
      .skip((page - 1) * perPage)
      .take(perPage);
    // Admin regional: solo accidentes de pedidos del negocio de SU municipio.
    applyMunicipalityScope(query, 'organizational', scopeMunicipalityIdFor(user));

    if (params.onlyPending === true) {
      query.andWhere('accident.reviewedAt IS NULL');
    } else if (params.onlyPending === false) {
      query.andWhere('accident.reviewedAt IS NOT NULL');
    }

    const [items, total] = await query.getManyAndCount();
    return {
      data: items,
      pagination: new PageMetaDto({ pageOptionsDto: params, itemCount: total }),
    };
  }

  /** Cuántos accidentes están sin revisar (badge del sidebar admin). */
  async unreviewedCount(user: User): Promise<number> {
    this.assertAdmin(user);
    const query = this._accidentRepository
      .createQueryBuilder('accident')
      .leftJoin('accident.invoice', 'invoice')
      .leftJoin('invoice.organizational', 'organizational')
      .where('accident.reviewedAt IS NULL');
    applyMunicipalityScope(query, 'organizational', scopeMunicipalityIdFor(user));
    return query.getCount();
  }

  async findOne(user: User, id: number): Promise<DeliveryAccident> {
    this.assertAdmin(user);
    const accident = await this._accidentRepository.findOne({
      where: { id },
      relations: [
        'deliveryUser',
        'invoice',
        'invoice.organizational',
        'invoice.details',
        'reviewedByAdmin',
      ],
    });
    if (!accident) throw new NotFoundException('Reporte no encontrado');
    // Admin regional: solo accidentes de pedidos del negocio de SU municipio
    // (evita adivinar/probar ids de otro municipio por fuera de su lista).
    if (
      isOutsideMunicipalityScope(
        accident.invoice?.organizational?.municipalityId,
        scopeMunicipalityIdFor(user),
      )
    ) {
      throw new ForbiddenException('No tienes acceso a este reporte.');
    }
    return accident;
  }

  /** "Procesar accidente" — el admin marca que ya lo atendió. */
  async review(user: User, id: number): Promise<DeliveryAccident> {
    // Reusa `findOne` (ya valida admin + alcance de municipio).
    const accident = await this.findOne(user, id);
    accident.reviewedAt = new Date();
    accident.reviewedByAdminId = user.id;
    return this._accidentRepository.save(accident);
  }

  private assertAdmin(user: User): void {
    if (!isAdminRole(user.roleType?.code)) {
      throw new ForbiddenException('Solo el administrador puede ver esto.');
    }
  }
}
