import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserRepository } from '../../shared/repositories/user.repository';
import { RoleTypeRepository } from '../../shared/repositories/roleType.repository';
import { MunicipalityRepository } from '../../shared/repositories/municipality.repository';
import { DepartmentRepository } from '../../shared/repositories/department.repository';
import { IdentificationTypeRepository } from '../../shared/repositories/identificationType.repository';
import { User } from '../../shared/entities/user.entity';
import { NOT_FOUND_MESSAGE } from '../../shared/constants/messages.constant';
import { CreateUserDto, RegisterUserDto, UpdateUserDto } from '../dtos/user.dto';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';

const SALT_ROUNDS = 12;

@Injectable()
export class UserService {
  constructor(
    private readonly _userRepository: UserRepository,
    private readonly _roleTypeRepository: RoleTypeRepository,
    private readonly _municipalityRepository: MunicipalityRepository,
    private readonly _departmentRepository: DepartmentRepository,
    private readonly _identificationTypeRepository: IdentificationTypeRepository,
  ) {}

  async findOne(id: string): Promise<User> {
    const user = await this._userRepository.findOne({
      where: { id },
      relations: ['roleType', 'municipality', 'department'],
    });
    if (!user) {
      throw new HttpException(NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND);
    }
    return user;
  }

  async findByParams(params: Record<string, any>): Promise<User> {
    return await this._userRepository.findOne({ where: params });
  }

  async create(dto: CreateUserDto): Promise<User> {
    await this.assertEmailAvailable(dto.email);
    await this.assertUsernameAvailable(dto.username);
    await this.assertRelationsExist(dto);

    const password = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = this._userRepository.create({ ...dto, password });
    return await this._userRepository.save(user);
  }

  /**
   * Auto-registro con un rol específico (cliente / repartidor). El rol se
   * resuelve por `code` contra la tabla `roleType`.
   */
  async register(dto: RegisterUserDto, roleCode: RoleTypeCode): Promise<User> {
    await this.assertEmailAvailable(dto.email);
    await this.assertUsernameAvailable(dto.username);

    const roleType = await this._roleTypeRepository.findOne({
      where: { code: roleCode },
    });
    if (!roleType) {
      throw new BadRequestException(
        `El rol "${roleCode}" no está configurado en la base de datos`,
      );
    }

    await this.assertRelationsExist(dto);

    const password = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = this._userRepository.create({
      ...dto,
      password,
      roleTypeId: roleType.id,
      isActive: true,
      isEmailVerified: false,
    });
    return await this._userRepository.save(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (dto.email && dto.email !== user.email) {
      await this.assertEmailAvailable(dto.email);
    }
    if (dto.username && dto.username !== user.username) {
      await this.assertUsernameAvailable(dto.username);
    }
    await this.assertRelationsExist(dto);

    const { password, ...rest } = dto;
    Object.assign(user, rest);
    if (password) {
      user.password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    return await this._userRepository.save(user);
  }

  async delete(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this._userRepository.delete(user.id);
  }

  // ---------- helpers ----------

  private async assertEmailAvailable(email?: string): Promise<void> {
    if (!email) return;
    const exists = await this._userRepository.findOne({ where: { email } });
    if (exists) {
      throw new ConflictException('El email ya está registrado');
    }
  }

  private async assertUsernameAvailable(username?: string): Promise<void> {
    if (!username) return;
    const exists = await this._userRepository.findOne({ where: { username } });
    if (exists) {
      throw new ConflictException('El nombre de usuario ya está en uso');
    }
  }

  private async assertRelationsExist(
    dto: Partial<CreateUserDto>,
  ): Promise<void> {
    if (dto.roleTypeId) {
      const roleType = await this._roleTypeRepository.findOne({
        where: { id: dto.roleTypeId },
      });
      if (!roleType) throw new BadRequestException('Rol no encontrado');
    }

    if (dto.municipalityId) {
      const municipality = await this._municipalityRepository.findOne({
        where: { id: dto.municipalityId },
      });
      if (!municipality)
        throw new NotFoundException('Municipio no encontrado');
    }

    if (dto.departmentId) {
      const department = await this._departmentRepository.findOne({
        where: { id: dto.departmentId },
      });
      if (!department)
        throw new NotFoundException('Departamento no encontrado');
    }

    if (dto.identificationTypeId) {
      const identificationType = await this._identificationTypeRepository.findOne(
        { where: { id: dto.identificationTypeId } },
      );
      if (!identificationType)
        throw new NotFoundException('Tipo de identificación no encontrado');
    }
  }
}
