import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ProductRepository } from '../../shared/repositories/product.repository';
import { OrganizationalRepository } from '../../shared/repositories/organizational.repository';
import { CategoryTypeRepository } from '../../shared/repositories/categoryType.repository';
import { Product } from '../../shared/entities/product.entity';
import { Organizational } from '../../shared/entities/organizational.entity';
import { User } from '../../shared/entities/user.entity';
import { LocalStorageService } from '../../localStorage/services/localStorage.service';
import { PageMetaDto } from '../../shared/dtos/pageMeta.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import {
  CreateProductDto,
  PaginatedProductsParamsDto,
  UpdateProductDto,
} from '../dtos/product.dto';

/**
 * CRUD de productos DEL NEGOCIO del usuario autenticado: todas las
 * operaciones se limitan al organizational cuyo legalPersonId es el user del
 * JWT. El cliente nunca envía organizationalId — lo resuelve el backend.
 */
@Injectable()
export class ProductService {
  constructor(
    private readonly _productRepository: ProductRepository,
    private readonly _organizationalRepository: OrganizationalRepository,
    private readonly _categoryTypeRepository: CategoryTypeRepository,
    private readonly _localStorageService: LocalStorageService,
  ) {}

  /** Negocio del usuario autenticado (dueño/representante legal). */
  async findMyOrganizational(user: User): Promise<Organizational> {
    const organizational = await this._organizationalRepository.findOne({
      where: { legalPersonId: user.id },
    });
    if (!organizational) {
      throw new NotFoundException(
        'Tu cuenta no tiene un negocio asociado. Contacta al administrador.',
      );
    }
    return organizational;
  }

  async create(user: User, dto: CreateProductDto): Promise<Product> {
    const organizational = await this.findMyOrganizational(user);
    await this.assertCategoryExists(dto.categoryTypeId);

    const product = this._productRepository.create({
      ...dto,
      organizationalId: organizational.id,
    });
    return await this._productRepository.save(product);
  }

  async findOne(user: User, id: number): Promise<Product> {
    const organizational = await this.findMyOrganizational(user);
    // El filtro por organizationalId evita ver productos de otros negocios.
    const product = await this._productRepository.findOne({
      where: { id, organizationalId: organizational.id },
      relations: ['categoryType'],
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    return product;
  }

  async paginatedList(
    user: User,
    params: PaginatedProductsParamsDto,
  ): Promise<ResponsePaginationDto<Product>> {
    const organizational = await this.findMyOrganizational(user);

    const page = params.page ?? 1;
    const perPage = params.perPage ?? 10;
    const skip = (page - 1) * perPage;

    const query = this._productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.categoryType', 'categoryType')
      .where('product.organizationalId = :organizationalId', {
        organizationalId: organizational.id,
      })
      .skip(skip)
      .take(perPage)
      .orderBy('product.name', params.order ?? 'ASC');

    if (params.search) {
      const search = `%${params.search.trim()}%`;
      query.andWhere(
        '(product.name ILIKE :search OR product.code ILIKE :search)',
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

  async update(user: User, id: number, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findOne(user, id);
    await this.assertCategoryExists(dto.categoryTypeId);

    Object.assign(product, dto);
    return await this._productRepository.save(product);
  }

  async delete(user: User, id: number): Promise<void> {
    const product = await this.findOne(user, id);
    await this._productRepository.remove(product);
    // Las fotos del producto se borran del disco (solo las subidas propias).
    for (const url of product.images ?? []) {
      const publicId = this._localStorageService.publicIdFromUrl(url);
      if (publicId) await this._localStorageService.deleteImage(publicId);
    }
  }

  /** Agrega una foto al producto (la primera del array es la principal). */
  async addImage(
    user: User,
    id: number,
    file: Express.Multer.File,
  ): Promise<{ imageUrl: string; images: string[] }> {
    const product = await this.findOne(user, id);

    const { imageUrl } = await this._localStorageService.saveImage(
      file,
      'products',
    );

    product.images = [...(product.images ?? []), imageUrl];
    await this._productRepository.save(product);

    return { imageUrl, images: product.images };
  }

  /** Quita una foto del producto y borra el archivo del disco (si es propio). */
  async removeImage(
    user: User,
    id: number,
    url: string,
  ): Promise<{ images: string[] }> {
    const product = await this.findOne(user, id);

    if (!(product.images ?? []).includes(url)) {
      throw new NotFoundException('La imagen no pertenece a este producto');
    }

    product.images = product.images.filter((image) => image !== url);
    await this._productRepository.save(product);

    const publicId = this._localStorageService.publicIdFromUrl(url);
    if (publicId) await this._localStorageService.deleteImage(publicId);

    return { images: product.images };
  }

  // ---------- helpers ----------

  private async assertCategoryExists(categoryTypeId?: number): Promise<void> {
    if (categoryTypeId == null) return;
    const found = await this._categoryTypeRepository.findOne({
      where: { id: categoryTypeId },
    });
    if (!found) {
      throw new BadRequestException('La categoría seleccionada no existe');
    }
  }
}
