import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SelectQueryBuilder } from 'typeorm';
import { OrganizationalRepository } from '../../shared/repositories/organizational.repository';
import { ProductRepository } from '../../shared/repositories/product.repository';
import { TagRepository } from '../../shared/repositories/tag.repository';
import { CategoryTypeRepository } from '../../shared/repositories/categoryType.repository';
import { Organizational } from '../../shared/entities/organizational.entity';
import { Product } from '../../shared/entities/product.entity';
import { Tag } from '../../shared/entities/tag.entity';
import { CategoryType } from '../../shared/entities/categoryType.entity';
import { PageMetaDto } from '../../shared/dtos/pageMeta.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import {
  PaginatedExploreOrganizationalsParamsDto,
  PaginatedExploreProductsParamsDto,
} from '../dtos/explore.dto';
import { isBusinessOpen } from '../../shared/utils/business-hours.util';

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
      .leftJoinAndSelect('organizational.tags', 'tag')
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
      bancolombiaQrUrl: organizational.bancolombiaQrUrl,
    };
  }
}
