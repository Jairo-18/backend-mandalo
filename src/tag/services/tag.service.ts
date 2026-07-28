import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TagRepository } from '../../shared/repositories/tag.repository';
import { OrganizationalRepository } from '../../shared/repositories/organizational.repository';
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
  constructor(
    private readonly _tagRepository: TagRepository,
    private readonly _organizationalRepository: OrganizationalRepository,
  ) {}

  async create(dto: CreateTagDto): Promise<Tag> {
    await this.assertCodeAvailable(dto.code);
    await this.assertNameAvailable(dto.name);
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
    if (dto.name && dto.name.trim() !== tag.name) {
      await this.assertNameAvailable(dto.name, tag.id);
    }

    Object.assign(tag, dto);
    return await this._tagRepository.save(tag);
  }

  /**
   * Bloquea el borrado si algún negocio tiene esta etiqueta asignada: es
   * relación N:M (`organizationalTag`) sin `onDelete` propio — TypeORM
   * borraría la fila del join en cascada y el negocio perdería la etiqueta
   * en silencio, sin avisar.
   */
  async delete(id: number): Promise<void> {
    const tag = await this.findOne(id);
    const businessesCount = await this._organizationalRepository
      .createQueryBuilder('organizational')
      .innerJoin('organizational.tags', 'tag', 'tag.id = :tagId', {
        tagId: tag.id,
      })
      .getCount();
    if (businessesCount > 0) {
      throw new ConflictException(
        `Esta etiqueta está asignada a ${businessesCount} negocio(s) y no se puede eliminar. Quítasela primero.`,
      );
    }
    await this._tagRepository.delete(tag.id);
  }

  // ---------- helpers ----------

  private async assertCodeAvailable(code: string): Promise<void> {
    const exists = await this._tagRepository.findOne({ where: { code } });
    if (exists) {
      throw new ConflictException('El código de la etiqueta ya está en uso');
    }
  }

  /** Nombre único sin importar mayúsculas/acentos de escritura (ILIKE exacto). */
  private async assertNameAvailable(
    name: string,
    excludeId?: number,
  ): Promise<void> {
    const query = this._tagRepository
      .createQueryBuilder('tag')
      .where('tag.name ILIKE :name', { name: name.trim() });
    if (excludeId) {
      query.andWhere('tag.id != :excludeId', { excludeId });
    }
    const exists = await query.getOne();
    if (exists) {
      throw new ConflictException('Ya existe una etiqueta con ese nombre');
    }
  }
}
