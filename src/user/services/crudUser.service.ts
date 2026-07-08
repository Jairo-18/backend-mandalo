import { Injectable } from '@nestjs/common';
import { UserRepository } from '../../shared/repositories/user.repository';
import { PageMetaDto } from '../../shared/dtos/pageMeta.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import { PaginatedUsersParamsDto } from '../dtos/crudUser.dto';
import { UserPaginatedListItem } from '../interfaces/user.interface';
import { User } from '../../shared/entities/user.entity';

@Injectable()
export class CrudUserService {
  constructor(private readonly _userRepository: UserRepository) {}

  async paginatedList(
    params: PaginatedUsersParamsDto,
  ): Promise<ResponsePaginationDto<UserPaginatedListItem>> {
    const page = params.page ?? 1;
    const perPage = params.perPage ?? 10;
    const skip = (page - 1) * perPage;

    const query = this._userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roleType', 'roleType')
      .leftJoinAndSelect('user.municipality', 'municipality')
      .leftJoinAndSelect('user.department', 'department')
      .leftJoinAndSelect('user.identificationType', 'identificationType')
      .skip(skip)
      .take(perPage)
      .orderBy('user.createdAt', params.order ?? 'ASC');

    if (params.email) {
      query.andWhere('user.email ILIKE :email', {
        email: `%${params.email}%`,
      });
    }

    if (params.roleTypeId) {
      query.andWhere('user.roleTypeId = :roleTypeId', {
        roleTypeId: params.roleTypeId,
      });
    }

    if (params.roleTypeCode) {
      query.andWhere('roleType.code = :roleTypeCode', {
        roleTypeCode: params.roleTypeCode,
      });
    }

    if (params.roleTypeCodes?.length) {
      query.andWhere('roleType.code IN (:...roleTypeCodes)', {
        roleTypeCodes: params.roleTypeCodes,
      });
    }

    // Filtros parciales por campo (los usa la búsqueda por campo del admin).
    if (params.fullName) {
      query.andWhere('user.fullName ILIKE :fullName', {
        fullName: `%${params.fullName.trim()}%`,
      });
    }
    if (params.phone) {
      query.andWhere('user.phone ILIKE :phone', {
        phone: `%${params.phone.trim()}%`,
      });
    }
    if (params.username) {
      query.andWhere('user.username ILIKE :username', {
        username: `%${params.username.trim()}%`,
      });
    }
    if (params.identificationNumber) {
      query.andWhere('user.identificationNumber ILIKE :identificationNumber', {
        identificationNumber: `%${params.identificationNumber.trim()}%`,
      });
    }

    if (params.municipalityId) {
      query.andWhere('user.municipalityId = :municipalityId', {
        municipalityId: params.municipalityId,
      });
    }

    if (params.departmentId) {
      query.andWhere('user.departmentId = :departmentId', {
        departmentId: params.departmentId,
      });
    }

    if (params.isActive !== undefined) {
      query.andWhere('user.isActive = :isActive', {
        isActive: params.isActive,
      });
    }

    if (params.isBanned !== undefined) {
      query.andWhere('user.isBanned = :isBanned', {
        isBanned: params.isBanned,
      });
    }

    if (params.search) {
      const search = `%${params.search.trim()}%`;
      query.andWhere(
        `(user.fullName ILIKE :search OR user.email ILIKE :search OR user.username ILIKE :search OR user.identificationNumber ILIKE :search OR user.phone ILIKE :search)`,
        { search },
      );
    }

    const [entities, itemCount] = await query.getManyAndCount();

    const data = entities.map((user) => this.toListItem(user));
    const pagination = new PageMetaDto({ itemCount, pageOptionsDto: params });

    return new ResponsePaginationDto(data, pagination);
  }

  private toListItem(user: User): UserPaginatedListItem {
    return {
      id: user.id,
      fullName: user.fullName,
      username: user.username ?? null,
      email: user.email,
      phone: user.phone ?? null,
      address: user.address ?? null,
      identificationNumber: user.identificationNumber ?? null,
      avatarUrl: user.avatarUrl ?? null,
      identificationFrontUrl: user.identificationFrontUrl ?? null,
      identificationBackUrl: user.identificationBackUrl ?? null,
      observations: user.observations ?? null,
      isActive: user.isActive,
      isBanned: user.isBanned,
      isEmailVerified: user.isEmailVerified,
      roleType: user.roleType
        ? {
            id: user.roleType.id,
            code: user.roleType.code,
            name: user.roleType.name,
          }
        : null,
      municipality: user.municipality
        ? {
            id: user.municipality.id,
            code: user.municipality.code,
            name: user.municipality.name,
          }
        : null,
      department: user.department
        ? {
            id: user.department.id,
            code: user.department.code,
            name: user.department.name,
          }
        : null,
      identificationType: user.identificationType
        ? {
            id: user.identificationType.id,
            code: user.identificationType.code,
            name: user.identificationType.name,
          }
        : null,
      createdAt: user.createdAt ?? null,
    };
  }
}
