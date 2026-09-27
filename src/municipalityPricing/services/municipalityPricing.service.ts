import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import { MunicipalityPricingRepository } from '../../shared/repositories/municipalityPricing.repository';
import { MunicipalityRepository } from '../../shared/repositories/municipality.repository';
import { MunicipalityPricing } from '../../shared/entities/municipalityPricing.entity';
import { User } from '../../shared/entities/user.entity';
import {
  DeliveryPricingService,
  FALLBACK_PRICING,
  PRICING_FIELDS,
  PricingValues,
  pickPricing,
} from '../../shared/services/delivery-pricing.service';
import { isSuperAdmin } from '../../shared/utils/municipality-scope.util';
import { UpdateMunicipalityPricingDto } from '../dtos/municipalityPricing.dto';

/** Código DANE del Putumayo: sus municipios salen siempre en el listado del superadmin. */
const OPERATING_DEPARTMENT_CODE = '86';

/**
 * Campos que solo el SUPERADMIN puede cambiar: son la plata de Mándalo
 * (su parte del domicilio y la tarifa de servicio), no el precio del
 * domicilio en sí. Un admin regional los ve, pero no los toca.
 */
export const SUPERADMIN_ONLY_FIELDS: (keyof PricingValues)[] = [
  'baseMandaloCut',
  'extraMandaloRate',
  'serviceFeePercent',
  'serviceFeeCap',
];

const FIELD_LABELS: Partial<Record<keyof PricingValues, string>> = {
  baseMandaloCut: 'la parte de Mándalo en la tarifa base',
  extraMandaloRate: 'el % de Mándalo en el excedente por km',
  serviceFeePercent: 'el % de la tarifa de servicio',
  serviceFeeCap: 'el tope de la tarifa de servicio',
};

type Editor = { id: string; fullName: string } | null;

export type PricingView = PricingValues & {
  updatedAt: Date | null;
  updatedBy: Editor;
};

export type MunicipalityPricingItem = {
  municipality: { id: number; code: string; name: string };
  /** true = tarifa propia; false = hereda la general. */
  isCustom: boolean;
  /** Tarifa efectiva (la propia, o la general si no tiene). */
  pricing: PricingView;
};

export type MunicipalityPricingOverview = {
  general: PricingView;
  municipalities: MunicipalityPricingItem[];
  /** Solo el SUPERADMIN edita la tarifa general. */
  canEditGeneral: boolean;
  /** Campos que ESTE usuario no puede cambiar (solo lectura en el form). */
  readOnlyFields: (keyof PricingValues)[];
};

/**
 * Administración de tarifas por municipio (panel admin "Tarifas"). Mismo
 * alcance que el resto del panel: SUPERADMIN ve y edita todo (incluida la
 * tarifa general); un ADMIN regional solo ve y edita la de SU municipio, y
 * no toca la parte de Mándalo (`SUPERADMIN_ONLY_FIELDS`).
 */
@Injectable()
export class MunicipalityPricingService {
  constructor(
    private readonly _pricingRepository: MunicipalityPricingRepository,
    private readonly _municipalityRepository: MunicipalityRepository,
    private readonly _deliveryPricingService: DeliveryPricingService,
  ) {}

  async overview(admin: User): Promise<MunicipalityPricingOverview> {
    const superAdmin = isSuperAdmin(admin);
    const rows = await this.withEditor().getMany();
    const generalRow = rows.find((row) => row.municipalityId == null) ?? null;
    const general = generalRow
      ? this.toView(generalRow)
      : { ...FALLBACK_PRICING, updatedAt: null, updatedBy: null };
    const ownRows = new Map(
      rows
        .filter((row) => row.municipalityId != null)
        .map((row) => [row.municipalityId as number, row]),
    );

    let municipalities: { id: number; code: string; name: string }[];
    if (superAdmin) {
      // Los del Putumayo siempre; más cualquier otro municipio donde ya haya
      // negocios o una tarifa propia (p. ej. un negocio que se registró en un
      // municipio vecino) — así ninguno queda sin poder tarifarse.
      municipalities = await this._municipalityRepository
        .createQueryBuilder('municipality')
        .leftJoin('municipality.department', 'department')
        .where('department.code = :departmentCode', {
          departmentCode: OPERATING_DEPARTMENT_CODE,
        })
        .orWhere(
          `municipality.id IN (SELECT o."municipalityId" FROM "organizational" o WHERE o."municipalityId" IS NOT NULL)`,
        )
        .orWhere(
          `municipality.id IN (SELECT mp."municipalityId" FROM "municipalityPricing" mp WHERE mp."municipalityId" IS NOT NULL)`,
        )
        .orderBy('municipality.name', 'ASC')
        .getMany();
    } else {
      const own = admin.municipalityId
        ? await this._municipalityRepository.findOne({
            where: { id: admin.municipalityId },
          })
        : null;
      municipalities = own ? [own] : [];
    }

    return {
      general,
      municipalities: municipalities.map((municipality) => {
        const own = ownRows.get(municipality.id);
        return {
          municipality: {
            id: municipality.id,
            code: municipality.code,
            name: municipality.name,
          },
          isCustom: !!own,
          pricing: own ? this.toView(own) : general,
        };
      }),
      canEditGeneral: superAdmin,
      readOnlyFields: superAdmin ? [] : [...SUPERADMIN_ONLY_FIELDS],
    };
  }

  /** Tarifa general — la ruta ya exige SUPERADMIN. */
  async updateGeneral(
    admin: User,
    dto: UpdateMunicipalityPricingDto,
  ): Promise<PricingView> {
    // IsNull() y NO `municipalityId: null`: en TypeORM 0.3 un `null` en el
    // where se IGNORA y devolvería la primera fila de la tabla (podía ser la
    // tarifa propia de un municipio y terminar pisándola).
    let row = await this._pricingRepository.findOne({
      where: { municipalityId: IsNull() },
    });
    const current: PricingValues = row
      ? pickPricing(row)
      : { ...FALLBACK_PRICING };
    const merged = this.merge(current, dto);
    this.assertConsistent(merged);

    row = this._pricingRepository.merge(
      row ?? this._pricingRepository.create({ municipalityId: null }),
      { ...merged, updatedById: admin.id },
    );
    const saved = await this._pricingRepository.save(row);
    await this._deliveryPricingService.invalidate();
    return this.reload(saved.id);
  }

  /**
   * Crea o edita la tarifa PROPIA de un municipio. Si todavía heredaba la
   * general, arranca como copia de la general con los cambios encima.
   */
  async updateMunicipality(
    admin: User,
    municipalityId: number,
    dto: UpdateMunicipalityPricingDto,
  ): Promise<PricingView> {
    await this.assertCanManage(admin, municipalityId);

    let row = await this._pricingRepository.findOne({
      where: { municipalityId },
    });
    const current: PricingValues = row
      ? pickPricing(row)
      : await this._deliveryPricingService.general();

    if (!isSuperAdmin(admin)) {
      for (const field of SUPERADMIN_ONLY_FIELDS) {
        const value = dto[field];
        if (value != null && value !== current[field]) {
          throw new ForbiddenException(
            `Solo el superadministrador puede cambiar ${FIELD_LABELS[field] ?? field}.`,
          );
        }
      }
    }

    const merged = this.merge(current, dto);
    this.assertConsistent(merged);

    row = this._pricingRepository.merge(
      row ?? this._pricingRepository.create({ municipalityId }),
      { ...merged, updatedById: admin.id },
    );
    const saved = await this._pricingRepository.save(row);
    await this._deliveryPricingService.invalidate();
    return this.reload(saved.id);
  }

  /** Borra la tarifa propia: el municipio vuelve a heredar la general. */
  async resetMunicipality(admin: User, municipalityId: number): Promise<void> {
    await this.assertCanManage(admin, municipalityId);
    await this._pricingRepository.delete({ municipalityId });
    await this._deliveryPricingService.invalidate();
  }

  // ---------- helpers ----------

  /**
   * SUPERADMIN: cualquier municipio que exista. ADMIN: solo el suyo (y si no
   * tiene municipio asignado, ninguno — nunca "todos").
   */
  private async assertCanManage(
    admin: User,
    municipalityId: number,
  ): Promise<void> {
    const municipality = await this._municipalityRepository.findOne({
      where: { id: municipalityId },
    });
    if (!municipality) throw new NotFoundException('Municipio no encontrado');
    if (isSuperAdmin(admin)) return;
    if (!admin.municipalityId) {
      throw new ForbiddenException(
        'Tu usuario administrador no tiene un municipio asignado. Pídele al superadministrador que te lo asigne.',
      );
    }
    if (admin.municipalityId !== municipalityId) {
      throw new ForbiddenException(
        'Solo puedes administrar las tarifas de tu municipio.',
      );
    }
  }

  private merge(
    current: PricingValues,
    dto: UpdateMunicipalityPricingDto,
  ): PricingValues {
    const merged = { ...current } as Record<string, unknown>;
    for (const field of PRICING_FIELDS) {
      const value = dto[field];
      if (value !== undefined && value !== null) merged[field] = value;
    }
    return merged as PricingValues;
  }

  /** Reglas entre campos, sobre el resultado final (no solo lo que llegó). */
  private assertConsistent(pricing: PricingValues): void {
    if (pricing.baseMandaloCut > pricing.baseFee) {
      throw new BadRequestException(
        'La parte de Mándalo no puede ser mayor que la tarifa base.',
      );
    }
    if (pricing.nightStartTime === pricing.nightEndTime) {
      throw new BadRequestException(
        'La franja nocturna debe tener hora de inicio y de fin distintas.',
      );
    }
  }

  private async reload(id: number): Promise<PricingView> {
    const row = await this.withEditor()
      .where('pricing.id = :id', { id })
      .getOne();
    return this.toView(row!);
  }

  /**
   * Tarifas + SOLO id y nombre de quien las editó (un `relations` normal
   * traería la fila entera del usuario: contraseña, tokens, documentos).
   */
  private withEditor() {
    return this._pricingRepository
      .createQueryBuilder('pricing')
      .leftJoin('pricing.updatedBy', 'editor')
      .addSelect(['editor.id', 'editor.fullName']);
  }

  private toView(row: MunicipalityPricing): PricingView {
    return {
      ...pickPricing(row),
      updatedAt: row.updatedAt ?? null,
      updatedBy: row.updatedBy
        ? { id: row.updatedBy.id, fullName: row.updatedBy.fullName }
        : null,
    };
  }
}
