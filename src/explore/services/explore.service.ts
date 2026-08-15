import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { In, SelectQueryBuilder } from 'typeorm';
import { OrganizationalRepository } from '../../shared/repositories/organizational.repository';
import { ProductRepository } from '../../shared/repositories/product.repository';
import { TagRepository } from '../../shared/repositories/tag.repository';
import { CategoryTypeRepository } from '../../shared/repositories/categoryType.repository';
import { DeliveryPricingService } from '../../shared/services/delivery-pricing.service';
import { InvoiceService } from '../../invoice/services/invoice.service';
import { Organizational } from '../../shared/entities/organizational.entity';
import { Product } from '../../shared/entities/product.entity';
import { Tag } from '../../shared/entities/tag.entity';
import { CategoryType } from '../../shared/entities/categoryType.entity';
import { PageMetaDto } from '../../shared/dtos/pageMeta.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import {
  DeliveryEstimateParamsDto,
  PaginatedExploreOrganizationalsParamsDto,
  PaginatedExploreProductsParamsDto,
} from '../dtos/explore.dto';
import { isBusinessOpen } from '../../shared/utils/business-hours.util';

/**
 * Cotización de domicilio hacia un negocio; todo en null si no tiene
 * coordenadas guardadas. `deliveryFee` YA incluye los recargos (nocturno,
 * clima, demanda); `surchargeReasons` es el texto amigable de cuáles aplican
 * ahora mismo (mismo cálculo que el preview real del checkout, ver
 * `InvoiceService.previewDeliveryFee`).
 */
export type DeliveryEstimate = {
  organizationalId: number;
  distanceKm: number | null;
  deliveryFee: number | null;
  etaMinutes: number | null;
  surchargeReasons: string[];
};

/** Negocio público + bandera calculada de apertura (horario Colombia). */
type PublicOrganizational = Partial<Organizational> & { isOpen: boolean };

/**
 * Vista del CLIENTE (rol USER): explorar negocios y sus productos.
 * Solo lectura y solo contenido visible: negocios activos con al menos un
 * producto activo. No expone datos del representante legal ni el NIT.
 */
@Injectable()
export class ExploreService {
  constructor(
    private readonly _organizationalRepository: OrganizationalRepository,
    private readonly _productRepository: ProductRepository,
    private readonly _tagRepository: TagRepository,
    private readonly _categoryTypeRepository: CategoryTypeRepository,
    private readonly _configService: ConfigService,
    private readonly _deliveryPricingService: DeliveryPricingService,
    private readonly _invoiceService: InvoiceService,
  ) {}

  /** Un negocio es visible si está activo Y tiene al menos un producto activo. */
  private static readonly VISIBLE_SQL = `organizational."isActive" = true
    AND EXISTS (
      SELECT 1 FROM "product" p
      WHERE p."organizationalId" = organizational.id AND p."isActive" = true
    )`;

  /**
   * Limita el listado a negocios dentro del radio de cercanía
   * (APP_NEARBY_RADIUS_KM) medido desde las coords del cliente — su
   * dirección principal ("enviar a"). Haversine en SQL; los negocios SIN
   * coordenadas quedan fuera (no se pueden ubicar). Sin lat/lng no filtra.
   */
  private applyNearFilter(
    query: SelectQueryBuilder<unknown>,
    lat?: number,
    lng?: number,
  ): void {
    if (lat == null || lng == null) return;
    const radiusKm =
      this._configService.get<number>('app.nearbyRadiusKm') ?? 10;
    query
      .andWhere(
        'organizational.latitude IS NOT NULL AND organizational.longitude IS NOT NULL',
      )
      .andWhere(
        `(6371 * acos(least(1, cos(radians(:nearLat)) * cos(radians(organizational.latitude))
          * cos(radians(organizational.longitude) - radians(:nearLng))
          + sin(radians(:nearLat)) * sin(radians(organizational.latitude))))) <= :radiusKm`,
        { nearLat: lat, nearLng: lng, radiusKm },
      );
  }

  /**
   * Etiquetas y categorías para los chips de filtros del home.
   * Solo las etiquetas usadas por negocios visibles (un chip nunca deja
   * el listado vacío) y las categorías usadas por sus productos activos.
   */
  async filters(): Promise<{ tags: Tag[]; categories: CategoryType[] }> {
    const tags = await this._tagRepository
      .createQueryBuilder('tag')
      .innerJoin('organizationalTag', 'ot', 'ot."tagId" = "tag"."id"')
      .innerJoin(
        'organizational',
        'organizational',
        `organizational.id = ot."organizationalId" AND ${ExploreService.VISIBLE_SQL}`,
      )
      .distinct(true)
      .orderBy('tag.name', 'ASC')
      .getMany();

    const categories = await this._categoryTypeRepository
      .createQueryBuilder('categoryType')
      .innerJoin(
        'product',
        'p',
        'p."categoryTypeId" = "categoryType"."id" AND p."isActive" = true',
      )
      .innerJoin(
        'organizational',
        'organizational',
        `organizational.id = p."organizationalId" AND organizational."isActive" = true`,
      )
      .distinct(true)
      .orderBy('categoryType.name', 'ASC')
      .getMany();

    return { tags, categories };
  }

  /** Listado de negocios visibles, con búsqueda por nombre y filtro por etiquetas. */
  async paginatedOrganizationals(
    params: PaginatedExploreOrganizationalsParamsDto,
  ): Promise<ResponsePaginationDto<Partial<Organizational>>> {
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 10;
    const skip = (page - 1) * perPage;

    const query = this._organizationalRepository
      .createQueryBuilder('organizational')
      // SIN `tags` acá: es many-to-many (`leftJoinAndSelect` haría fan-out,
      // una fila SQL por etiqueta) y con `skip/take` eso parte las filas de
      // un mismo negocio entre dos páginas — el negocio queda duplicado o
      // incompleto al scrollear (cards vacías, mismo id repetido en la
      // lista). Las etiquetas se traen aparte más abajo, ya sin paginar.
      .leftJoinAndSelect('organizational.municipality', 'municipality')
      .where(ExploreService.VISIBLE_SQL)
      .skip(skip)
      .take(perPage)
      // El cliente ve el nombre comercial; si no hay, la razón social.
      // (Orden por columnas de la entidad: una expresión cruda rompe la
      // subquery DISTINCT que arma TypeORM al paginar con joins.)
      .orderBy('organizational.tradeName', params.order ?? 'ASC', 'NULLS LAST')
      .addOrderBy('organizational.legalName', params.order ?? 'ASC');

    if (params.search) {
      const search = `%${params.search.trim()}%`;
      query.andWhere(
        `(organizational.legalName ILIKE :search
          OR organizational.tradeName ILIKE :search
          OR organizational.description ILIKE :search)`,
        { search },
      );
    }

    if (params.tagIds?.length) {
      query.andWhere(
        `EXISTS (
          SELECT 1 FROM "organizationalTag" ot
          WHERE ot."organizationalId" = organizational.id
            AND ot."tagId" IN (:...tagIds)
        )`,
        { tagIds: params.tagIds },
      );
    }

    this.applyNearFilter(query, params.lat, params.lng);

    const [entities, itemCount] = await query.getManyAndCount();

    // Etiquetas de ESTA página (ya paginada, sin fan-out): un solo query
    // aparte, sin skip/take, así que el join many-to-many no rompe nada.
    if (entities.length) {
      const withTags = await this._organizationalRepository.find({
        where: { id: In(entities.map((e) => e.id)) },
        relations: ['tags'],
      });
      const tagsById = new Map(withTags.map((o) => [o.id, o.tags]));
      for (const organizational of entities) {
        organizational.tags = tagsById.get(organizational.id) ?? [];
      }
    }

    const pagination = new PageMetaDto({ itemCount, pageOptionsDto: params });

    return new ResponsePaginationDto(
      entities.map((organizational) => this.toPublicOrganizational(organizational)),
      pagination,
    );
  }

  /**
   * Detalle de un negocio visible + las categorías que usan sus productos
   * activos (para pintar solo los chips que aplican a ESE negocio).
   */
  async findOrganizational(
    id: number,
  ): Promise<{ organizational: Partial<Organizational>; categories: CategoryType[] }> {
    const organizational = await this._organizationalRepository
      .createQueryBuilder('organizational')
      .leftJoinAndSelect('organizational.tags', 'tag')
      .leftJoinAndSelect('organizational.municipality', 'municipality')
      .where('organizational.id = :id', { id })
      .andWhere('organizational."isActive" = true')
      .getOne();

    if (!organizational) {
      throw new NotFoundException('Negocio no encontrado');
    }

    const categories = await this._categoryTypeRepository
      .createQueryBuilder('categoryType')
      .innerJoin(
        'product',
        'p',
        `p."categoryTypeId" = "categoryType"."id"
          AND p."organizationalId" = :id AND p."isActive" = true`,
        { id },
      )
      .distinct(true)
      .orderBy('categoryType.name', 'ASC')
      .getMany();

    return {
      organizational: this.toPublicOrganizational(organizational),
      categories,
    };
  }

  /**
   * Búsqueda GLOBAL de productos (home del cliente): productos activos de
   * negocios activos, con el negocio embebido para mostrar "quién lo vende".
   * El search también matchea el nombre del negocio (buscar "mahoma" trae
   * todos sus productos).
   */
  async paginatedAllProducts(
    params: PaginatedExploreProductsParamsDto,
  ): Promise<ResponsePaginationDto<Product>> {
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 10;
    const skip = (page - 1) * perPage;

    const query = this._productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.categoryType', 'categoryType')
      .innerJoin('product.organizational', 'organizational')
      // Solo lo que la card necesita del negocio (nada de NIT/dueño).
      // Las columnas de horario van para calcular isOpen en el mapper.
      .addSelect([
        'organizational.id',
        'organizational.legalName',
        'organizational.tradeName',
        'organizational.logoUrl',
        'organizational.latitude',
        'organizational.longitude',
        'organizational.openTime',
        'organizational.closeTime',
        'organizational.openDays',
        'organizational.temporarilyClosed',
      ])
      .where('product.isActive = true')
      .andWhere('organizational.isActive = true')
      .skip(skip)
      .take(perPage)
      .orderBy('product.name', params.order ?? 'ASC');

    if (params.search) {
      const search = `%${params.search.trim()}%`;
      query.andWhere(
        `(product.name ILIKE :search
          OR product.description ILIKE :search
          OR organizational.legalName ILIKE :search
          OR organizational.tradeName ILIKE :search)`,
        { search },
      );
    }
    if (params.categoryTypeId) {
      query.andWhere('product.categoryTypeId = :categoryTypeId', {
        categoryTypeId: params.categoryTypeId,
      });
    }
    if (params.tagIds?.length) {
      query.andWhere(
        `EXISTS (
          SELECT 1 FROM "organizationalTag" ot
          WHERE ot."organizationalId" = organizational.id
            AND ot."tagId" IN (:...tagIds)
        )`,
        { tagIds: params.tagIds },
      );
    }

    this.applyNearFilter(query, params.lat, params.lng);

    const [entities, itemCount] = await query.getManyAndCount();
    // El cliente decide en la card si puede agregar al carrito: cada producto
    // lleva la bandera de apertura de SU negocio.
    for (const product of entities) {
      if (product.organizational) {
        (product.organizational as Organizational & { isOpen: boolean }).isOpen =
          isBusinessOpen(product.organizational);
      }
    }
    const pagination = new PageMetaDto({ itemCount, pageOptionsDto: params });

    return new ResponsePaginationDto(entities, pagination);
  }

  /** Productos activos de un negocio visible, con búsqueda y filtro por categoría. */
  async paginatedProducts(
    organizationalId: number,
    params: PaginatedExploreProductsParamsDto,
  ): Promise<ResponsePaginationDto<Product>> {
    const exists = await this._organizationalRepository.findOne({
      where: { id: organizationalId, isActive: true },
    });
    if (!exists) {
      throw new NotFoundException('Negocio no encontrado');
    }

    const page = params.page ?? 1;
    const perPage = params.perPage ?? 10;
    const skip = (page - 1) * perPage;

    const query = this._productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.categoryType', 'categoryType')
      .where('product.organizationalId = :organizationalId', {
        organizationalId,
      })
      .andWhere('product.isActive = true')
      .skip(skip)
      .take(perPage)
      .orderBy('product.name', params.order ?? 'ASC');

    if (params.search) {
      const search = `%${params.search.trim()}%`;
      query.andWhere(
        '(product.name ILIKE :search OR product.description ILIKE :search)',
        { search },
      );
    }
    if (params.categoryTypeId) {
      query.andWhere('product.categoryTypeId = :categoryTypeId', {
        categoryTypeId: params.categoryTypeId,
      });
    }

    const [entities, itemCount] = await query.getManyAndCount();
    const pagination = new PageMetaDto({ itemCount, pageOptionsDto: params });

    return new ResponsePaginationDto(entities, pagination);
  }

  /**
   * Distancia + tarifa de domicilio (con sus recargos) + ETA desde la
   * ubicación del cliente hasta cada negocio pedido — SIN crear un pedido
   * (el explorar, estilo Rappi). Reusa el mismo cálculo del preview real del
   * checkout (`InvoiceService.previewDeliveryFee`) para no duplicar la
   * lógica de recargo nocturno/clima/demanda ni desincronizarse de ella. Un
   * negocio sin coordenadas guardadas sale con todo en null (el front decide
   * si oculta el dato o no).
   */
  async deliveryEstimates(
    params: DeliveryEstimateParamsDto,
  ): Promise<DeliveryEstimate[]> {
    return Promise.all(
      params.organizationalIds.map(async (organizationalId) => {
        const breakdown = await this._invoiceService.previewDeliveryFee({
          organizationalId,
          latitude: params.lat,
          longitude: params.lng,
        });
        if (breakdown.distanceKm == null) {
          return {
            organizationalId,
            distanceKm: null,
            deliveryFee: null,
            etaMinutes: null,
            surchargeReasons: [],
          };
        }
        return {
          organizationalId,
          // 2 decimales (~10m de precisión): el front decide si lo muestra
          // en metros (<1km) o en km, y con 1 sola cifra ya se perdía la
          // diferencia entre, por ej., 300m y 400m.
          distanceKm: breakdown.distanceKm,
          deliveryFee:
            Math.round((breakdown.deliveryFee + breakdown.deliverySurcharge) * 100) /
            100,
          etaMinutes: this._deliveryPricingService.estimateMinutesForDistance(
            breakdown.distanceKm,
          ),
          surchargeReasons: breakdown.surchargeReasons,
        };
      }),
    );
  }

  // ---------- helpers ----------

  /** Campos del negocio que ve el cliente (sin NIT, dueño ni metadatos de admin). */
  private toPublicOrganizational(
    organizational: Organizational,
  ): PublicOrganizational {
    return {
      id: organizational.id,
      legalName: organizational.legalName,
      tradeName: organizational.tradeName,
      description: organizational.description,
      logoUrl: organizational.logoUrl,
      phone: organizational.phone,
      address: organizational.address,
      latitude: organizational.latitude,
      longitude: organizational.longitude,
      municipality: organizational.municipality,
      tags: organizational.tags,
      openTime: organizational.openTime,
      closeTime: organizational.closeTime,
      openDays: organizational.openDays,
      temporarilyClosed: organizational.temporarilyClosed,
      isOpen: isBusinessOpen(organizational),
      // Datos de pago: el checkout los muestra cuando el método no es
      // efectivo (a dónde transferir + a nombre de quién).
      paymentHolderName: organizational.paymentHolderName,
      nequiNumber: organizational.nequiNumber,
      nequiKey: organizational.nequiKey,
      bancolombiaAccount: organizational.bancolombiaAccount,
      bancolombiaAccountType: organizational.bancolombiaAccountType,
      bancolombiaQrUrl: organizational.bancolombiaQrUrl,
    };
  }
}
