import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CategoryTypeRepository } from '../../shared/repositories/categoryType.repository';
import { ProductRepository } from '../../shared/repositories/product.repository';
import { CategoryType } from '../../shared/entities/categoryType.entity';
import { PageMetaDto } from '../../shared/dtos/pageMeta.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import {
  CreateCategoryTypeDto,
  PaginatedCategoryTypesParamsDto,
  UpdateCategoryTypeDto,
} from '../dtos/categoryType.dto';

@Injectable()
export class CategoryTypeService {
  constructor(
    private readonly _categoryTypeRepository: CategoryTypeRepository,
    private readonly _productRepository: ProductRepository,
  ) {}

  async create(dto: CreateCategoryTypeDto): Promise<CategoryType> {
    await this.assertCodeAvailable(dto.code);
    await this.assertNameAvailable(dto.name);
    const categoryType = this._categoryTypeRepository.create(dto);
    return await this._categoryTypeRepository.save(categoryType);
  }

  async findOne(id: number): Promise<CategoryType> {
    const categoryType = await this._categoryTypeRepository.findOne({
      where: { id },
    });
    if (!categoryType) {
      throw new NotFoundException('Categoría no encontrada');
    }
    return categoryType;
  }

  async paginatedList(
    params: PaginatedCategoryTypesParamsDto,
  ): Promise<ResponsePaginationDto<CategoryType>> {
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 10;
    const skip = (page - 1) * perPage;

    const query = this._categoryTypeRepository
      .createQueryBuilder('categoryType')
      .skip(skip)
      .take(perPage)
      .orderBy('categoryType.name', params.order ?? 'ASC');

    if (params.search) {
      const search = `%${params.search.trim()}%`;
      query.andWhere(
        `(categoryType.name ILIKE :search OR categoryType.code ILIKE :search)`,
        { search },
      );
    }

    const [entities, itemCount] = await query.getManyAndCount();
    const pagination = new PageMetaDto({ itemCount, pageOptionsDto: params });

    return new ResponsePaginationDto(entities, pagination);
  }

  async update(id: number, dto: UpdateCategoryTypeDto): Promise<CategoryType> {
    const categoryType = await this.findOne(id);

    if (dto.code && dto.code !== categoryType.code) {
      await this.assertCodeAvailable(dto.code);
    }
    if (dto.name && dto.name.trim() !== categoryType.name) {
      await this.assertNameAvailable(dto.name, categoryType.id);
    }

    Object.assign(categoryType, dto);
    return await this._categoryTypeRepository.save(categoryType);
  }

  /**
   * Bloquea el borrado si hay productos con esta categoría: el FK
   * (`Product.categoryTypeId`) es `SET NULL`, así que sin este chequeo se
   * borraría igual y los productos quedarían sin categoría en silencio.
   */
  async delete(id: number): Promise<void> {
    const categoryType = await this.findOne(id);
    const productsCount = await this._productRepository.count({
      where: { categoryTypeId: categoryType.id },
    });
    if (productsCount > 0) {
      throw new ConflictException(
        `Esta categoría tiene ${productsCount} producto(s) asignado(s) y no se puede eliminar. Cámbiales la categoría primero.`,
      );
    }
    await this._categoryTypeRepository.delete(categoryType.id);
  }

  // ---------- helpers ----------

  private async assertCodeAvailable(code: string): Promise<void> {
    const exists = await this._categoryTypeRepository.findOne({
      where: { code },
    });
    if (exists) {
      throw new ConflictException('El código de la categoría ya está en uso');
    }
  }

  /** Nombre único sin importar mayúsculas/acentos de escritura (ILIKE exacto). */
  private async assertNameAvailable(
    name: string,
    excludeId?: number,
  ): Promise<void> {
    const query = this._categoryTypeRepository
      .createQueryBuilder('categoryType')
      .where('categoryType.name ILIKE :name', { name: name.trim() });
    if (excludeId) {
      query.andWhere('categoryType.id != :excludeId', { excludeId });
    }
    const exists = await query.getOne();
    if (exists) {
      throw new ConflictException('Ya existe una categoría con ese nombre');
    }
  }
}
