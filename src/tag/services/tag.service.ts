import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TagRepository } from '../../shared/repositories/tag.repository';
import { Tag } from '../../shared/entities/tag.entity';
import { PageMetaDto } from '../../shared/dtos/pageMeta.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import {
  CreateTagDto,
  PaginatedTagsParamsDto,
  UpdateTagDto,
} from '../dtos/tag.dto';

@Injectable()
export class TagService {
  constructor(private readonly _tagRepository: TagRepository) {}

  async create(dto: CreateTagDto): Promise<Tag> {
    await this.assertCodeAvailable(dto.code);
    const tag = this._tagRepository.create(dto);
    return await this._tagRepository.save(tag);
  }

  async findOne(id: number): Promise<Tag> {
    const tag = await this._tagRepository.findOne({ where: { id } });
    if (!tag) {
      throw new NotFoundException('Etiqueta no encontrada');
    }
    return tag;
  }

  async paginatedList(
    params: PaginatedTagsParamsDto,
  ): Promise<ResponsePaginationDto<Tag>> {
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 10;
    const skip = (page - 1) * perPage;

    const query = this._tagRepository
      .createQueryBuilder('tag')
      .skip(skip)
      .take(perPage)
      .orderBy('tag.name', params.order ?? 'ASC');

    if (params.search) {
      const search = `%${params.search.trim()}%`;
      query.andWhere(`(tag.name ILIKE :search OR tag.code ILIKE :search)`, {
        search,
      });
    }

    const [entities, itemCount] = await query.getManyAndCount();
    const pagination = new PageMetaDto({ itemCount, pageOptionsDto: params });

    return new ResponsePaginationDto(entities, pagination);
  }

  async update(id: number, dto: UpdateTagDto): Promise<Tag> {
    const tag = await this.findOne(id);

    if (dto.code && dto.code !== tag.code) {
      await this.assertCodeAvailable(dto.code);
    }

    Object.assign(tag, dto);
    return await this._tagRepository.save(tag);
  }

  async delete(id: number): Promise<void> {
    const tag = await this.findOne(id);
    await this._tagRepository.delete(tag.id);
  }

  // ---------- helpers ----------

  private async assertCodeAvailable(code: string): Promise<void> {
    const exists = await this._tagRepository.findOne({ where: { code } });
    if (exists) {
      throw new ConflictException('El código de la etiqueta ya está en uso');
    }
  }
}
