import { Injectable, NotFoundException } from '@nestjs/common';
import { In } from 'typeorm';
import { FavoriteBusinessRepository, FavoriteProductRepository } from '../../shared/repositories/favorite.repository';
import { OrganizationalRepository } from '../../shared/repositories/organizational.repository';
import { ProductRepository } from '../../shared/repositories/product.repository';
import { Organizational } from '../../shared/entities/organizational.entity';
import { Product } from '../../shared/entities/product.entity';
import { User } from '../../shared/entities/user.entity';
import { PageMetaDto } from '../../shared/dtos/pageMeta.dto';
import { ParamsPaginationDto, ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import { isBusinessOpen } from '../../shared/utils/business-hours.util';
import {
  PRODUCT_ORGANIZATIONAL_SELECT,
  PublicOrganizational,
  toPublicOrganizational,
} from '../../explore/services/explore.service';

/** Ids favoritos del usuario: la app los guarda para pintar los corazones. */
export type FavoriteIds = { businessIds: number[]; productIds: number[] };

/**
 * Favoritos del cliente: negocios y productos marcados con el corazón.
 * Las listas devuelven el MISMO formato que el explorar (para reusar las
 * tarjetas del home) más `available`: un favorito desactivado sigue en la
 * lista (la app lo muestra como "No disponible") hasta que el usuario lo
 * quite; uno borrado desaparece solo (CASCADE).
 */
@Injectable()
export class FavoriteService {
  constructor(
    private readonly _favoriteBusinessRepository: FavoriteBusinessRepository,
    private readonly _favoriteProductRepository: FavoriteProductRepository,
    private readonly _organizationalRepository: OrganizationalRepository,
    private readonly _productRepository: ProductRepository,
  ) {}

  async ids(user: User): Promise<FavoriteIds> {
    const [businesses, products] = await Promise.all([
      this._favoriteBusinessRepository.find({
        where: { userId: user.id },
        select: { organizationalId: true },
      }),
      this._favoriteProductRepository.find({
        where: { userId: user.id },
        select: { productId: true },
      }),
    ]);
    return {
      businessIds: businesses.map((f) => f.organizationalId),
      productIds: products.map((f) => f.productId),
    };
  }

  // ---------- negocios ----------

  async addBusiness(user: User, organizationalId: number): Promise<void> {
    const exists = await this._organizationalRepository.exists({
      where: { id: organizationalId, isActive: true },
    });
    if (!exists) throw new NotFoundException('Negocio no encontrado');
    // Idempotente: tocar dos veces el corazón no rompe nada.
    await this._favoriteBusinessRepository
      .createQueryBuilder()
      .insert()
      .values({ userId: user.id, organizationalId })
      .orIgnore()
      .execute();
  }

  async removeBusiness(user: User, organizationalId: number): Promise<void> {
    await this._favoriteBusinessRepository.delete({ userId: user.id, organizationalId });
  }

  /** Negocios favoritos, el último guardado primero. */
  async businesses(
    user: User,
    params: ParamsPaginationDto,
  ): Promise<ResponsePaginationDto<PublicOrganizational & { available: boolean }>> {
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 10;
    const [favorites, itemCount] = await this._favoriteBusinessRepository.findAndCount({
      where: { userId: user.id },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    const ids = favorites.map((f) => f.organizationalId);
    const organizationals = ids.length
      ? await this._organizationalRepository.find({
          where: { id: In(ids) },
          relations: ['municipality', 'tags'],
        })
      : [];
    const byId = new Map(organizationals.map((o) => [o.id, o]));

    const data = ids
      .map((id) => byId.get(id))
      .filter((o): o is Organizational => !!o)
      .map((o) => ({ ...toPublicOrganizational(o), available: o.isActive }));

    return new ResponsePaginationDto(
      data,
      new PageMetaDto({ itemCount, pageOptionsDto: params }),
    );
  }

  // ---------- productos ----------

  async addProduct(user: User, productId: number): Promise<void> {
    const exists = await this._productRepository.exists({
      where: { id: productId, isActive: true },
    });
    if (!exists) throw new NotFoundException('Producto no encontrado');
    await this._favoriteProductRepository
      .createQueryBuilder()
      .insert()
      .values({ userId: user.id, productId })
      .orIgnore()
      .execute();
  }

  async removeProduct(user: User, productId: number): Promise<void> {
    await this._favoriteProductRepository.delete({ userId: user.id, productId });
  }

  /** Productos favoritos (con su negocio embebido, igual que el home). */
  async products(
    user: User,
    params: ParamsPaginationDto,
  ): Promise<ResponsePaginationDto<Product & { available: boolean }>> {
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 10;
    const [favorites, itemCount] = await this._favoriteProductRepository.findAndCount({
      where: { userId: user.id },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * perPage,
      take: perPage,
    });

    const ids = favorites.map((f) => f.productId);
    const products = ids.length
      ? await this._productRepository
          .createQueryBuilder('product')
          .leftJoinAndSelect('product.categoryType', 'categoryType')
          .innerJoin('product.organizational', 'organizational')
          .addSelect([...PRODUCT_ORGANIZATIONAL_SELECT, 'organizational.isActive'])
          .where('product.id IN (:...ids)', { ids })
          .getMany()
      : [];
    const byId = new Map(products.map((p) => [p.id, p]));

    const data = ids
      .map((id) => byId.get(id))
      .filter((p): p is Product => !!p)
      .map((product) => {
        const org = product.organizational;
        const available = product.isActive && !!org?.isActive;
        if (org) {
          (org as Organizational & { isOpen: boolean }).isOpen = isBusinessOpen(org);
        }
        return Object.assign(product, { available });
      });

    return new ResponsePaginationDto(
      data,
      new PageMetaDto({ itemCount, pageOptionsDto: params }),
    );
  }
}
