import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { In } from 'typeorm';
import { OrganizationalRepository } from '../../shared/repositories/organizational.repository';
import { RoleTypeRepository } from '../../shared/repositories/roleType.repository';
import { TagRepository } from '../../shared/repositories/tag.repository';
import { UserRepository } from '../../shared/repositories/user.repository';
import { DepartmentRepository } from '../../shared/repositories/department.repository';
import { MunicipalityRepository } from '../../shared/repositories/municipality.repository';
import { IdentificationTypeRepository } from '../../shared/repositories/identificationType.repository';
import { InvoiceRepository } from '../../shared/repositories/invoice.repository';
import { Organizational } from '../../shared/entities/organizational.entity';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';
import { UserService } from '../../user/services/user.service';
import { LocalStorageService } from '../../localStorage/services/localStorage.service';
import { PageMetaDto } from '../../shared/dtos/pageMeta.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import {
  CreateOrganizationalDto,
  PaginatedOrganizationalsParamsDto,
  UpdateOrganizationalDto,
} from '../dtos/organizational.dto';

/** Relaciones que se cargan al devolver un negocio (listado y detalle). */
const RELATIONS = [
  'identificationType',
  'municipality',
  'department',
  'legalPerson',
  'tags',
];

@Injectable()
export class OrganizationalService {
  constructor(
    private readonly _organizationalRepository: OrganizationalRepository,
    private readonly _tagRepository: TagRepository,
    private readonly _userRepository: UserRepository,
    private readonly _departmentRepository: DepartmentRepository,
    private readonly _municipalityRepository: MunicipalityRepository,
    private readonly _identificationTypeRepository: IdentificationTypeRepository,
    private readonly _roleTypeRepository: RoleTypeRepository,
    private readonly _userService: UserService,
    private readonly _localStorageService: LocalStorageService,
    private readonly _invoiceRepository: InvoiceRepository,
  ) {}

  async create(dto: CreateOrganizationalDto): Promise<Organizational> {
    await this.assertRelationsExist(dto);
    if (dto.identificationNumber) {
      await this.assertIdentificationAvailable(dto.identificationNumber);
    }

    const { tagIds, accountEmail, accountPassword, ...data } = dto;

    // Cuenta de acceso del negocio (rol NEGO): correo + contraseña crean el
    // usuario dueño en el mismo paso. Excluyente con vincular uno existente.
    if (accountEmail || accountPassword) {
      if (data.legalPersonId) {
        throw new BadRequestException(
          'Vincula un representante existente O crea la cuenta nueva, no ambos',
        );
      }
      if (!accountEmail || !accountPassword) {
        throw new BadRequestException(
          'Para crear la cuenta del negocio envía correo y contraseña',
        );
      }
      const owner = await this._userService.create({
        fullName: data.tradeName || data.legalName,
        email: accountEmail,
        password: accountPassword,
        roleTypeCode: RoleTypeCode.BUSINESS,
      });
      data.legalPersonId = owner.id;
    } else if (data.legalPersonId) {
      // Usuario existente vinculado como dueño: pasa a rol NEGO para que al
      // iniciar sesión entre a la vista de negocio.
      await this.ensureBusinessRole(data.legalPersonId);
    }

    const organizational = this._organizationalRepository.create(data);
    if (tagIds !== undefined) {
      organizational.tags = await this.resolveTags(tagIds);
    }
    return await this._organizationalRepository.save(organizational);
  }

  async findOne(id: number): Promise<Organizational> {
    const organizational = await this._organizationalRepository.findOne({
      where: { id },
      relations: RELATIONS,
    });
    if (!organizational) {
      throw new NotFoundException('Negocio no encontrado');
    }
    return organizational;
  }

  /**
   * Negocio del que el usuario autenticado es dueño/representante legal
   * (para la app del rol NEGO). Si tuviera varios, devuelve el primero.
   */
  async findMine(userId: string): Promise<Organizational> {
    const organizational = await this._organizationalRepository.findOne({
      where: { legalPersonId: userId },
      relations: ['identificationType', 'municipality', 'department', 'tags'],
    });
    if (!organizational) {
      throw new NotFoundException(
        'Tu cuenta no tiene un negocio asociado. Contacta al administrador.',
      );
    }
    return organizational;
  }

  async paginatedList(
    params: PaginatedOrganizationalsParamsDto,
  ): Promise<ResponsePaginationDto<Organizational>> {
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 10;
    const skip = (page - 1) * perPage;

    const query = this._organizationalRepository
      .createQueryBuilder('organizational')
      .leftJoinAndSelect(
        'organizational.identificationType',
        'identificationType',
      )
      .leftJoinAndSelect('organizational.municipality', 'municipality')
      .leftJoinAndSelect('organizational.department', 'department')
      .leftJoinAndSelect('organizational.tags', 'tag')
      .leftJoin('organizational.legalPerson', 'legalPerson')
      // Solo datos visibles del representante (nada de tokens/password).
      .addSelect([
        'legalPerson.id',
        'legalPerson.fullName',
        'legalPerson.email',
        'legalPerson.phone',
        'legalPerson.identificationNumber',
      ])
      .skip(skip)
      .take(perPage)
      .orderBy('organizational.legalName', params.order ?? 'ASC');

    if (params.search) {
      const search = `%${params.search.trim()}%`;
      query.andWhere(
        `(organizational.legalName ILIKE :search
          OR organizational.tradeName ILIKE :search
          OR organizational.identificationNumber ILIKE :search)`,
        { search },
      );
    }

    // Filtros por campo (búsqueda por campo + filtro de tipo del admin).
    if (params.legalName) {
      query.andWhere('organizational.legalName ILIKE :legalName', {
        legalName: `%${params.legalName.trim()}%`,
      });
    }
    if (params.identificationNumber) {
      query.andWhere(
        'organizational.identificationNumber ILIKE :identificationNumber',
        { identificationNumber: `%${params.identificationNumber.trim()}%` },
      );
    }
    if (params.identificationTypeId) {
      query.andWhere(
        'organizational.identificationTypeId = :identificationTypeId',
        { identificationTypeId: params.identificationTypeId },
      );
    }

    const [entities, itemCount] = await query.getManyAndCount();
    const pagination = new PageMetaDto({ itemCount, pageOptionsDto: params });

    return new ResponsePaginationDto(entities, pagination);
  }

  /**
   * Edición del negocio PROPIO (rol NEGO, desde su panel): el negocio se
   * resuelve por el JWT y se ignoran los campos que solo maneja el admin
   * (dueño, cuenta de acceso y estado activo).
   */
  async updateMine(
    userId: string,
    dto: UpdateOrganizationalDto,
  ): Promise<Organizational> {
    const mine = await this.findMine(userId);
    const {
      legalPersonId: _lp,
      accountEmail: _ae,
      accountPassword: _ap,
      isActive: _ia,
      ...data
    } = dto;
    return this.update(mine.id, data);
  }

  /** Logo del negocio propio (rol NEGO): resuelve el id desde el JWT. */
  async updateMyLogo(
    userId: string,
    file: Express.Multer.File,
  ): Promise<{ logoUrl: string }> {
    const mine = await this.findMine(userId);
    return this.updateLogo(mine.id, file);
  }

  async update(
    id: number,
    dto: UpdateOrganizationalDto,
  ): Promise<Organizational> {
    const organizational = await this.findOne(id);
    await this.assertRelationsExist(dto);

    if (
      dto.identificationNumber &&
      dto.identificationNumber !== organizational.identificationNumber
    ) {
      await this.assertIdentificationAvailable(dto.identificationNumber);
    }

    // accountEmail/accountPassword solo aplican al crear; en edición se ignoran.
    const { tagIds, accountEmail: _e, accountPassword: _p, ...data } = dto;

    // Si se vincula (o cambia) el dueño, el usuario pasa a rol NEGO.
    if (data.legalPersonId && data.legalPersonId !== organizational.legalPersonId) {
      await this.ensureBusinessRole(data.legalPersonId);
    }

    Object.assign(organizational, data);
    if (tagIds !== undefined) {
      organizational.tags = await this.resolveTags(tagIds);
    }
    return await this._organizationalRepository.save(organizational);
  }

  /**
   * Eliminar es DESTRUCTIVO: `invoice.organizationalId` es CASCADE, así que
   * borrar un negocio con pedidos borraría el historial (facturas). Se
   * bloquea con 409 — el camino correcto es desactivarlo.
   */
  async delete(id: number): Promise<void> {
    const organizational = await this.findOne(id);
    const orders = await this._invoiceRepository.count({
      where: { organizationalId: organizational.id },
    });
    if (orders > 0) {
      throw new ConflictException(
        'Este negocio tiene pedidos en el historial y no se puede eliminar. Desactívalo en su lugar.',
      );
    }
    await this._organizationalRepository.remove(organizational);
  }

  /**
   * Sube/reemplaza el logo del negocio: guarda la imagen nueva, actualiza
   * `logoUrl` y borra el archivo anterior del disco (si era una subida local).
   */
  async updateLogo(
    id: number,
    file: Express.Multer.File,
  ): Promise<{ logoUrl: string }> {
    const organizational = await this.findOne(id);

    const { imageUrl } = await this._localStorageService.saveImage(
      file,
      'organizational',
    );

    const oldPublicId = this._localStorageService.publicIdFromUrl(
      organizational.logoUrl,
    );
    await this._organizationalRepository.update(id, { logoUrl: imageUrl });
    if (oldPublicId) {
      await this._localStorageService.deleteImage(oldPublicId);
    }

    return { logoUrl: imageUrl };
  }

  // ---------- helpers ----------

  private async assertIdentificationAvailable(
    identificationNumber: string,
  ): Promise<void> {
    const exists = await this._organizationalRepository.findOne({
      where: { identificationNumber },
    });
    if (exists) {
      throw new ConflictException(
        'Ya existe un negocio con ese número de identificación',
      );
    }
  }

  /** Valida que las FKs enviadas existan (mismos mensajes que el registro de usuario). */
  private async assertRelationsExist(
    dto: CreateOrganizationalDto | UpdateOrganizationalDto,
  ): Promise<void> {
    if (dto.identificationTypeId != null) {
      const found = await this._identificationTypeRepository.findOne({
        where: { id: dto.identificationTypeId },
      });
      if (!found) {
        throw new BadRequestException(
          'El tipo de identificación seleccionado no existe',
        );
      }
    }
    if (dto.departmentId != null) {
      const found = await this._departmentRepository.findOne({
        where: { id: dto.departmentId },
      });
      if (!found) {
        throw new BadRequestException('El departamento seleccionado no existe');
      }
    }
    if (dto.municipalityId != null) {
      const found = await this._municipalityRepository.findOne({
        where: { id: dto.municipalityId },
      });
      if (!found) {
        throw new BadRequestException('El municipio seleccionado no existe');
      }
    }
    if (dto.legalPersonId != null) {
      const found = await this._userRepository.findOne({
        where: { id: dto.legalPersonId },
      });
      if (!found) {
        throw new BadRequestException(
          'El usuario representante seleccionado no existe',
        );
      }
    }
  }

  /**
   * Asigna el rol NEGO al usuario vinculado como dueño (si no lo tiene ya).
   * Los ADMIN no se degradan: pueden ser dueños sin perder el panel admin.
   */
  private async ensureBusinessRole(legalPersonId: string): Promise<void> {
    const user = await this._userRepository.findOne({
      where: { id: legalPersonId },
      relations: ['roleType'],
    });
    if (!user) return; // assertRelationsExist ya validó que exista

    const code = user.roleType?.code;
    if (code === RoleTypeCode.BUSINESS || code === RoleTypeCode.ADMIN) return;

    const businessRole = await this._roleTypeRepository.findOne({
      where: { code: RoleTypeCode.BUSINESS },
    });
    if (!businessRole) {
      throw new BadRequestException(
        `El rol "${RoleTypeCode.BUSINESS}" no está configurado en la base de datos`,
      );
    }
    await this._userRepository.update(user.id, {
      roleTypeId: businessRole.id,
    });
  }

  private async resolveTags(tagIds: number[]) {
    if (tagIds.length === 0) return [];
    const tags = await this._tagRepository.findBy({ id: In(tagIds) });
    if (tags.length !== new Set(tagIds).size) {
      throw new BadRequestException('Alguna de las etiquetas no existe');
    }
    return tags;
  }
}
