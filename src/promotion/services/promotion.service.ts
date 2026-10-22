import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { In } from 'typeorm';
import {
  PromotionProductRepository,
  PromotionRepository,
} from '../../shared/repositories/promotion.repository';
import { OrganizationalRepository } from '../../shared/repositories/organizational.repository';
import { ProductRepository } from '../../shared/repositories/product.repository';
import { Promotion, PromotionProduct } from '../../shared/entities/promotion.entity';
import { Organizational } from '../../shared/entities/organizational.entity';
import { User } from '../../shared/entities/user.entity';
import { LocalStorageService } from '../../localStorage/services/localStorage.service';
import { isAdminRole } from '../../shared/roles/roleTypeCode.enum';
import {
  isOutsideMunicipalityScope,
  scopeMunicipalityIdFor,
} from '../../shared/utils/municipality-scope.util';
import { containsProfanity } from '../../shared/utils/profanity.util';
import { fieldBadRequest } from '../../shared/utils/validation-errors.util';
import { isBusinessOpen } from '../../shared/utils/business-hours.util';
import {
  CreatePromotionDto,
  MAX_ACTIVE_PROMOTIONS,
  PromotionFeedParamsDto,
  PromotionItemDto,
  UpdatePromotionDto,
} from '../dtos/promotion.dto';
import { isPromotionLive, promotionStatus, PromotionStatus } from '../promotion-rules';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Promoción tal como la ve el cliente (home y tienda). */
export type PublicPromotion = {
  id: number;
  title: string;
  message: string | null;
  imageUrl: string | null;
  price: number;
  /** Lo que costarían los productos sueltos (para tachar y mostrar el ahorro). */
  regularPrice: number;
  endsAt: Date;
  organizational: {
    id: number;
    legalName: string;
    tradeName: string | null;
    logoUrl: string | null;
    isOpen: boolean;
  } | null;
  items: {
    productId: number;
    name: string;
    quantity: number;
    imageUrl: string | null;
    /** Precio unitario vigente (con descuento) del producto suelto. */
    unitPrice: number;
  }[];
};

/** Promoción vista por su negocio (o el admin): con su estado. */
export type OwnerPromotion = PublicPromotion & {
  status: PromotionStatus;
  isActive: boolean;
  hiddenByAdmin: boolean;
  startsAt: Date;
};

/**
 * Publicidad de los negocios ("Mis publicidades"). Se publica sola (el admin
 * puede ocultarla), vigencia de 1 a 30 días desde que se guarda, hasta
 * `MAX_ACTIVE_PROMOTIONS` activas por negocio. El cliente la ve en el
 * carrusel del home y arriba en la tienda, y la compra como UNA línea del
 * pedido a su precio (ver `InvoiceService.create`).
 */
@Injectable()
export class PromotionService {
  constructor(
    private readonly _promotionRepository: PromotionRepository,
    private readonly _promotionProductRepository: PromotionProductRepository,
    private readonly _organizationalRepository: OrganizationalRepository,
    private readonly _productRepository: ProductRepository,
    private readonly _localStorageService: LocalStorageService,
    private readonly _configService: ConfigService,
  ) {}

  // ---------- negocio: "Mis publicidades" ----------

  async mine(user: User): Promise<OwnerPromotion[]> {
    const org = await this.myOrganizational(user);
    const promos = await this.loadFull({ organizationalId: org.id });
    return promos.map((p) => this.toOwner(p, org));
  }

  async create(user: User, dto: CreatePromotionDto): Promise<OwnerPromotion> {
    const org = await this.myOrganizational(user);
    this.assertClean(dto.title, dto.message);
    await this.assertProducts(org.id, dto.items);
    const isActive = dto.isActive ?? true;
    if (isActive) await this.assertActiveLimit(org.id);

    const now = new Date();
    const saved = await this._promotionRepository.save(
      this._promotionRepository.create({
        organizationalId: org.id,
        title: dto.title,
        message: dto.message ?? null,
        price: dto.price,
        startsAt: now,
        endsAt: new Date(now.getTime() + dto.durationDays * DAY_MS),
        isActive,
        items: this.toItems(dto.items),
      }),
    );
    return this.findOwned(user, saved.id);
  }

  async update(
    user: User,
    id: number,
    dto: UpdatePromotionDto,
  ): Promise<OwnerPromotion> {
    const { promo, org } = await this.loadOwned(user, id);
    this.assertClean(dto.title, dto.message);

    if (dto.title !== undefined) promo.title = dto.title;
    if (dto.message !== undefined) promo.message = dto.message || null;
    if (dto.price !== undefined) promo.price = dto.price;
    if (dto.durationDays !== undefined) {
      const now = new Date();
      promo.startsAt = now;
      promo.endsAt = new Date(now.getTime() + dto.durationDays * DAY_MS);
    }
    if (dto.isActive !== undefined) promo.isActive = dto.isActive;

    // Activa y vigente después del cambio: cuenta para el tope.
    if (promo.isActive && new Date(promo.endsAt) > new Date()) {
      await this.assertActiveLimit(org.id, promo.id);
    }

    if (dto.items !== undefined) {
      await this.assertProducts(org.id, dto.items);
      await this._promotionProductRepository.delete({ promotionId: promo.id });
      promo.items = this.toItems(dto.items).map((item) =>
        Object.assign(item, { promotionId: promo.id }),
      );
    } else {
      delete promo.items; // no tocar los productos guardados
    }
    delete promo.organizational;
    await this._promotionRepository.save(promo);
    return this.findOwned(user, promo.id);
  }

  async setImage(
    user: User,
    id: number,
    file: Express.Multer.File,
  ): Promise<{ imageUrl: string }> {
    const { promo } = await this.loadOwned(user, id);
    const { imageUrl } = await this._localStorageService.saveBanner(file, 'promotions');
    const previous = promo.imageUrl;
    await this._promotionRepository.update(promo.id, { imageUrl });
    await this.deleteFile(previous);
    return { imageUrl };
  }

  /** El negocio dueño o un admin (de su municipio) borran la promoción. */
  async remove(user: User, id: number): Promise<void> {
    const promo = isAdminRole(user.roleType?.code)
      ? await this.loadForAdmin(user, id)
      : (await this.loadOwned(user, id)).promo;
    await this._promotionRepository.delete(promo.id);
    await this.deleteFile(promo.imageUrl);
  }

  // ---------- público: home y tienda ----------

  /** Carrusel del home: promos vigentes de negocios visibles y cercanos. */
  async feed(params: PromotionFeedParamsDto): Promise<PublicPromotion[]> {
    const query = this._promotionRepository
      .createQueryBuilder('promotion')
      .innerJoinAndSelect('promotion.organizational', 'organizational')
      .leftJoinAndSelect('promotion.items', 'item')
      .leftJoinAndSelect('item.product', 'product')
      .where('promotion.isActive = true')
      .andWhere('promotion.hiddenByAdmin = false')
      .andWhere('promotion.startsAt <= now() AND promotion.endsAt > now()')
      .andWhere('organizational.isActive = true')
      .orderBy('promotion.createdAt', 'DESC');

    if (params.lat != null && params.lng != null) {
      const radiusKm = this._configService.get<number>('app.nearbyRadiusKm') ?? 10;
      query
        .andWhere(
          'organizational.latitude IS NOT NULL AND organizational.longitude IS NOT NULL',
        )
        .andWhere(
          `(6371 * acos(least(1, cos(radians(:nearLat)) * cos(radians(organizational.latitude))
            * cos(radians(organizational.longitude) - radians(:nearLng))
            + sin(radians(:nearLat)) * sin(radians(organizational.latitude))))) <= :radiusKm`,
          { nearLat: params.lat, nearLng: params.lng, radiusKm },
        );
    }

    const promos = await query.getMany();
    // Abierto ahora primero (un cerrado igual se muestra: puede programar).
    return promos
      .filter((p) => isPromotionLive(p))
      .slice(0, 20)
      .map((p) => this.toPublic(p, p.organizational!));
  }

  /** Promos vigentes de UN negocio (arriba en su tienda). */
  async forBusiness(organizationalId: number): Promise<PublicPromotion[]> {
    const org = await this._organizationalRepository.findOne({
      where: { id: organizationalId, isActive: true },
    });
    if (!org) return [];
    const promos = await this.loadFull({ organizationalId });
    return promos.filter((p) => isPromotionLive(p)).map((p) => this.toPublic(p, org));
  }

  // ---------- admin: moderación ----------

  async adminForBusiness(admin: User, organizationalId: number): Promise<OwnerPromotion[]> {
    const org = await this._organizationalRepository.findOne({
      where: { id: organizationalId },
    });
    if (!org) throw new NotFoundException('Negocio no encontrado');
    this.assertAdminScope(admin, org);
    const promos = await this.loadFull({ organizationalId });
    return promos.map((p) => this.toOwner(p, org));
  }

  async setHidden(admin: User, id: number, hidden: boolean): Promise<void> {
    const promo = await this.loadForAdmin(admin, id);
    await this._promotionRepository.update(promo.id, { hiddenByAdmin: hidden });
  }

  // ---------- helpers ----------

  private async loadFull(where: { organizationalId: number }): Promise<Promotion[]> {
    return this._promotionRepository.find({
      where,
      relations: ['items', 'items.product'],
      order: { createdAt: 'DESC', items: { id: 'ASC' } },
    });
  }

  private async findOwned(user: User, id: number): Promise<OwnerPromotion> {
    const { promo, org } = await this.loadOwned(user, id);
    return this.toOwner(promo, org);
  }

  private async loadOwned(user: User, id: number) {
    const org = await this.myOrganizational(user);
    const promo = await this._promotionRepository.findOne({
      where: { id, organizationalId: org.id },
      relations: ['items', 'items.product'],
    });
    if (!promo) throw new NotFoundException('Promoción no encontrada');
    return { promo, org };
  }

  private async loadForAdmin(admin: User, id: number): Promise<Promotion> {
    if (!isAdminRole(admin.roleType?.code)) {
      throw new ForbiddenException('No tienes permisos para realizar esta acción');
    }
    const promo = await this._promotionRepository.findOne({
      where: { id },
      relations: ['organizational'],
    });
    if (!promo) throw new NotFoundException('Promoción no encontrada');
    this.assertAdminScope(admin, promo.organizational!);
    return promo;
  }

  private assertAdminScope(admin: User, org: Organizational): void {
    if (isOutsideMunicipalityScope(org.municipalityId, scopeMunicipalityIdFor(admin))) {
      throw new ForbiddenException('Este negocio no es de tu municipio.');
    }
  }

  private async myOrganizational(user: User): Promise<Organizational> {
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

  private assertClean(title?: string | null, message?: string | null): void {
    if (containsProfanity(title)) {
      throw fieldBadRequest('title', 'El título tiene palabras no permitidas.');
    }
    if (containsProfanity(message)) {
      throw fieldBadRequest('message', 'El mensaje tiene palabras no permitidas.');
    }
  }

  /** Productos propios, activos y sin repetir. */
  private async assertProducts(
    organizationalId: number,
    items: PromotionItemDto[],
  ): Promise<void> {
    const ids = items.map((i) => i.productId);
    if (new Set(ids).size !== ids.length) {
      throw fieldBadRequest('items', 'Hay un producto repetido en la promoción.');
    }
    const products = await this._productRepository.find({
      where: { id: In(ids), organizationalId },
    });
    if (products.length !== ids.length) {
      throw fieldBadRequest('items', 'Algún producto no existe o no es de tu negocio.');
    }
    const inactive = products.find((p) => !p.isActive);
    if (inactive) {
      throw fieldBadRequest(
        'items',
        `El producto "${inactive.name}" está inactivo: actívalo o quítalo de la promoción.`,
      );
    }
  }

  /** Tope de promociones activas y vigentes (sin contar `exceptId`). */
  private async assertActiveLimit(organizationalId: number, exceptId?: number) {
    const active = await this._promotionRepository
      .createQueryBuilder('promotion')
      .where('promotion.organizationalId = :organizationalId', { organizationalId })
      .andWhere('promotion.isActive = true')
      .andWhere('promotion.endsAt > now()')
      .andWhere(exceptId ? 'promotion.id <> :exceptId' : '1=1', { exceptId })
      .getCount();
    if (active >= MAX_ACTIVE_PROMOTIONS) {
      throw new BadRequestException(
        `Puedes tener máximo ${MAX_ACTIVE_PROMOTIONS} promociones activas. Pausa o borra una para activar otra.`,
      );
    }
  }

  private toItems(items: PromotionItemDto[]): PromotionProduct[] {
    return items.map((item) =>
      this._promotionProductRepository.create({
        productId: item.productId,
        quantity: item.quantity,
      }),
    );
  }

  private toPublic(p: Promotion, org: Organizational): PublicPromotion {
    const items = (p.items ?? []).map((item) => ({
      productId: item.productId,
      name: item.product?.name ?? 'Producto',
      quantity: item.quantity,
      imageUrl: item.product?.images?.[0] ?? null,
      unitPrice: item.product
        ? Math.round(item.product.priceSale * (1 - (item.product.discount ?? 0) / 100))
        : 0,
    }));
    const regularPrice = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    return {
      id: p.id,
      title: p.title,
      message: p.message ?? null,
      imageUrl: p.imageUrl ?? null,
      price: p.price,
      regularPrice,
      endsAt: p.endsAt,
      organizational: {
        id: org.id,
        legalName: org.legalName,
        tradeName: org.tradeName ?? null,
        logoUrl: org.logoUrl ?? null,
        isOpen: isBusinessOpen(org),
      },
      items,
    };
  }

  private toOwner(p: Promotion, org: Organizational): OwnerPromotion {
    return {
      ...this.toPublic(p, org),
      status: promotionStatus(p),
      isActive: p.isActive,
      hiddenByAdmin: p.hiddenByAdmin,
      startsAt: p.startsAt,
    };
  }

  private async deleteFile(url?: string | null): Promise<void> {
    const publicId = this._localStorageService.publicIdFromUrl(url);
    if (publicId) await this._localStorageService.deleteImage(publicId);
  }
}
