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

/** Unidades entregadas del producto en los últimos 30 días (para el ranking). */
const SOLD_LAST_30_DAYS_SQL = `(SELECT COALESCE(SUM(d.quantity), 0)
    FROM "invoiceDetail" d
    JOIN "invoice" i ON i.id = d."invoiceId"
    JOIN "stateType" st ON st.id = i."stateTypeId"
    WHERE d."productId" = product.id
      AND st.code = 'ENTR'
      AND i."deliveredAt" > now() - interval '30 days')`;

/** Filas del home: cuántas categorías y cuántos productos por fila. */
const HOME_ROWS = 8;
const HOME_ROW_SIZE = 10;
/** Cuántos productos rankeados se leen para armar las filas del home. */
const HOME_ROWS_SCAN_LIMIT = 600;
/** Menú de la tienda: tope de productos y tamaño de "Más pedidos". */
const MENU_LIMIT = 300;
const MENU_POPULAR_SIZE = 6;

/** Negocio público + bandera calculada de apertura (horario Colombia). */
export type PublicOrganizational = Partial<Organizational> & { isOpen: boolean };

/**
 * Columnas del negocio que viajan embebidas en cada producto del explorar
 * (lo que la card necesita: nada de NIT/dueño; el horario es para `isOpen`).
 */
export const PRODUCT_ORGANIZATIONAL_SELECT = [
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
  'organizational.ratingAverage',
  'organizational.ratingCount',
];

/** Campos del negocio que ve el cliente (sin NIT, dueño ni metadatos de admin). */
export function toPublicOrganizational(
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
    ratingAverage: organizational.ratingAverage ?? null,
    ratingCount: organizational.ratingCount ?? 0,
    // Datos de pago: el checkout los muestra cuando el método no es
    // efectivo (a dónde transferir + a nombre de quién).
    paymentHolderName: organizational.paymentHolderName,
    nequiNumber: organizational.nequiNumber,
    nequiKey: organizational.nequiKey,
    bancolombiaAccount: organizational.bancolombiaAccount,
    bancolombiaAccountType: organizational.bancolombiaAccountType,
    bancolombiaQrUrl: organizational.bancolombiaQrUrl,
    nequiQrUrl: organizational.nequiQrUrl,
  };
}

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
      entities.map((organizational) => toPublicOrganizational(organizational)),
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
      organizational: toPublicOrganizational(organizational),
      categories,
    };
  }

  /**
   * Ids de los negocios activos ABIERTOS ahora mismo. Usa la misma regla del
   * aviso de "Cerrado" (`isBusinessOpen`, hora de Colombia) en vez de
   * reescribir los horarios en SQL; son pocos negocios y solo se leen las
   * columnas del horario.
   */
  private async openOrganizationalIds(): Promise<number[]> {
    const rows = await this._organizationalRepository.find({
      where: { isActive: true },
      select: {
        id: true,
        openTime: true,
        closeTime: true,
        openDays: true,
        temporarilyClosed: true,
      },
    });
    return rows.filter((o) => isBusinessOpen(o)).map((o) => o.id);
  }

  /**
   * Búsqueda GLOBAL de productos (home del cliente): productos activos de
   * negocios activos, con el negocio embebido para mostrar "quién lo vende".
   * El search también matchea el nombre del negocio (buscar "mahoma" trae
   * todos sus productos).
   *
   * Orden (no alfabético: lo primero que se ve es lo que se vende):
   *  1. Con búsqueda: primero los que EMPIEZAN por lo buscado, luego los que
   *     lo contienen (y los que solo coinciden por negocio/descripción).
   *  2. Negocios abiertos ahora antes que los cerrados.
   *  3. Lo más pedido (unidades entregadas en los últimos 30 días).
   *  4. Mejor calificación del negocio.
   *  5. Productos nuevos (últimos 7 días) primero.
   *  6. Rotación diaria: los empates se mezclan con una semilla que cambia
   *     cada día (hora de Colombia) — estable durante el día, así el scroll
   *     infinito no repite ni salta productos entre páginas.
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
      .addSelect(PRODUCT_ORGANIZATIONAL_SELECT)
      .where('product.isActive = true')
      .andWhere('organizational.isActive = true')
      // offset/limit (no skip/take): el orderBy con expresiones crudas rompe
      // la subquery DISTINCT del paginado con joins (gotcha §20). Los joins
      // son ManyToOne, no duplican filas.
      .offset(skip)
      .limit(perPage);

    const search = params.search?.trim();
    if (search) {
      query
        .andWhere(
          `(product.name ILIKE :search
            OR product.description ILIKE :search
            OR organizational.legalName ILIKE :search
            OR organizational.tradeName ILIKE :search)`,
          { search: `%${search}%` },
        )
        .orderBy(
          `CASE WHEN product.name ILIKE :prefix THEN 0
                WHEN product.name ILIKE :search THEN 1 ELSE 2 END`,
          'ASC',
        )
        .setParameter('prefix', `${search}%`);
    }

    await this.applyRanking(query, { afterSearch: !!search });
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
    this.markOpen(entities);
    const pagination = new PageMetaDto({ itemCount, pageOptionsDto: params });

    return new ResponsePaginationDto(entities, pagination);
  }

  /**
   * Filas del home por CATEGORÍA: cada fila mezcla productos de TODOS los
   * negocios cercanos de esa categoría, con el mismo ranking del listado
   * (abiertos, más pedidos, calificación, nuevos, rotación del día). Las
   * categorías van de la más pedida en la zona a la menos (empate: más
   * productos, luego nombre). Hasta `HOME_ROWS` filas de `HOME_ROW_SIZE`.
   */
  async homeRows(params: PaginatedExploreProductsParamsDto): Promise<{
    rows: { categoryType: CategoryType; products: Product[] }[];
  }> {
    const query = this.rankedProductsQuery();
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
    query.andWhere('product.categoryTypeId IS NOT NULL').limit(HOME_ROWS_SCAN_LIMIT);
    await this.applyRanking(query, { afterSearch: false });

    const { products, sold } = await this.productsWithSold(query);
    this.markOpen(products);

    const byCategory = new Map<
      number,
      { categoryType: CategoryType; products: Product[]; sold: number; total: number }
    >();
    for (const product of products) {
      const category = product.categoryType;
      if (!category) continue;
      const row =
        byCategory.get(category.id) ??
        { categoryType: category, products: [], sold: 0, total: 0 };
      row.total += 1;
      row.sold += sold.get(product.id) ?? 0;
      if (row.products.length < HOME_ROW_SIZE) row.products.push(product);
      byCategory.set(category.id, row);
    }
    const rows = [...byCategory.values()]
      .sort(
        (a, b) =>
          b.sold - a.sold ||
          b.total - a.total ||
          a.categoryType.name.localeCompare(b.categoryType.name, 'es'),
      )
      .slice(0, HOME_ROWS)
      .map(({ categoryType, products: list }) => ({ categoryType, products: list }));
    return { rows };
  }

  /**
   * Menú de UN negocio por secciones (tienda del cliente): "Más pedidos"
   * (si ya vendió algo) y una sección por categoría en orden ALFABÉTICO, con
   * "Otros" al final para los productos sin categoría. Dentro de cada
   * sección: más pedidos, nuevos y rotación del día. Sin paginar: un negocio
   * tiene pocos productos (tope de seguridad `MENU_LIMIT`).
   */
  async storeMenu(organizationalId: number): Promise<{
    sections: {
      key: string;
      title: string;
      categoryTypeId: number | null;
      products: Product[];
    }[];
  }> {
    const exists = await this._organizationalRepository.findOne({
      where: { id: organizationalId, isActive: true },
    });
    if (!exists) throw new NotFoundException('Negocio no encontrado');

    const query = this.rankedProductsQuery()
      .andWhere('product.organizationalId = :organizationalId', { organizationalId })
      .limit(MENU_LIMIT);
    await this.applyRanking(query, { afterSearch: false });
    const { products, sold } = await this.productsWithSold(query);
    this.markOpen(products);

    const sections: {
      key: string;
      title: string;
      categoryTypeId: number | null;
      products: Product[];
    }[] = [];

    const popular = products
      .filter((p) => (sold.get(p.id) ?? 0) > 0)
      .sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0))
      .slice(0, MENU_POPULAR_SIZE);
    // Solo tiene sentido si hay más productos que los "más pedidos".
    if (popular.length && products.length > popular.length) {
      sections.push({ key: 'popular', title: 'Más pedidos', categoryTypeId: null, products: popular });
    }

    const byCategory = new Map<number, { name: string; products: Product[] }>();
    const others: Product[] = [];
    for (const product of products) {
      if (!product.categoryType) {
        others.push(product);
        continue;
      }
      const entry =
        byCategory.get(product.categoryType.id) ??
        { name: product.categoryType.name, products: [] };
      entry.products.push(product);
      byCategory.set(product.categoryType.id, entry);
    }
    [...byCategory.entries()]
      .sort((a, b) => a[1].name.localeCompare(b[1].name, 'es'))
      .forEach(([id, entry]) =>
        sections.push({
          key: `cat-${id}`,
          title: entry.name,
          categoryTypeId: id,
          products: entry.products,
        }),
      );
    if (others.length) {
      sections.push({
        key: 'other',
        title: byCategory.size ? 'Otros' : 'Productos',
        categoryTypeId: null,
        products: others,
      });
    }
    return { sections };
  }

  // ---------- ranking compartido (home, filas, menú de la tienda) ----------

  /** Productos activos de negocios activos con lo que la tarjeta necesita del negocio. */
  private rankedProductsQuery(): SelectQueryBuilder<Product> {
    return this._productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.categoryType', 'categoryType')
      .innerJoin('product.organizational', 'organizational')
      .addSelect(PRODUCT_ORGANIZATIONAL_SELECT)
      .addSelect(SOLD_LAST_30_DAYS_SQL, 'product_sold')
      .where('product.isActive = true')
      .andWhere('organizational.isActive = true');
  }

  /**
   * Orden de "lo que se vende": abiertos ahora, más pedidos (30 días),
   * calificación del negocio, nuevos (7 días) y rotación del día (semilla en
   * hora de Colombia: estable durante el día, sin repetidos al paginar).
   * `afterSearch`: ya hay un orderBy de relevancia de búsqueda adelante.
   */
  private async applyRanking(
    query: SelectQueryBuilder<Product>,
    { afterSearch }: { afterSearch: boolean },
  ): Promise<void> {
    const openIds = await this.openOrganizationalIds();
    const openSql = openIds.length
      ? `CASE WHEN organizational.id IN (${openIds.map(Number).join(',')}) THEN 0 ELSE 1 END`
      : '0';
    const daySeed = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10);
    const orderBy = afterSearch ? query.addOrderBy.bind(query) : query.orderBy.bind(query);
    orderBy(openSql, 'ASC');
    query
      .addOrderBy(SOLD_LAST_30_DAYS_SQL, 'DESC')
      .addOrderBy('COALESCE(organizational."ratingAverage", 0)', 'DESC')
      .addOrderBy(
        `CASE WHEN product."createdAt" > now() - interval '7 days' THEN 0 ELSE 1 END`,
        'ASC',
      )
      .addOrderBy(`md5(product.id::text || :daySeed)`, 'ASC')
      .addOrderBy('product.id', 'ASC')
      .setParameter('daySeed', daySeed);
  }

  /** Entidades + unidades vendidas (30 días) de cada producto, del mismo query. */
  private async productsWithSold(
    query: SelectQueryBuilder<Product>,
  ): Promise<{ products: Product[]; sold: Map<number, number> }> {
    const { entities, raw } = await query.getRawAndEntities();
    const sold = new Map<number, number>();
    for (const row of raw as { product_id: number; product_sold: string | number }[]) {
      sold.set(Number(row.product_id), Number(row.product_sold) || 0);
    }
    return { products: entities, sold };
  }

  /** Cada producto lleva si SU negocio está abierto (la tarjeta lo muestra). */
  private markOpen(products: Product[]): void {
    for (const product of products) {
      if (product.organizational) {
        (product.organizational as Organizational & { isOpen: boolean }).isOpen =
          isBusinessOpen(product.organizational);
      }
    }
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
}
