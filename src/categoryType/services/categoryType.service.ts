import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CategoryTypeRepository } from '../../shared/repositories/categoryType.repository';
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
  ) {}

  async create(dto: CreateCategoryTypeDto): Promise<CategoryType> {
    await this.assertCodeAvailable(dto.code);
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

    Object.assign(categoryType, dto);
    return await this._categoryTypeRepository.save(categoryType);
  }

  async delete(id: number): Promise<void> {
    const categoryType = await this.findOne(id);
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
}
