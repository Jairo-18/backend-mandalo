import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserAddressRepository } from '../../shared/repositories/userAddress.repository';
import { UserAddress } from '../../shared/entities/userAddress.entity';
import { User } from '../../shared/entities/user.entity';
import {
  CreateUserAddressDto,
  UpdateUserAddressDto,
} from '../dtos/userAddress.dto';

/** Tope de direcciones por usuario (suficiente y evita abuso). */
const MAX_ADDRESSES = 10;

/**
 * Direcciones de entrega DEL usuario autenticado: el userId sale siempre del
 * JWT, así que cada quien solo ve/edita las suyas. Reglas: siempre hay UNA
 * principal (isDefault); la primera nace principal; al borrar la principal
 * se promueve la más antigua.
 */
@Injectable()
export class UserAddressService {
  constructor(
    private readonly _userAddressRepository: UserAddressRepository,
  ) {}

  /** Mis direcciones, la principal primero. */
  async listMine(user: User): Promise<UserAddress[]> {
    return this._userAddressRepository.find({
      where: { userId: user.id },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });
  }

  async create(user: User, dto: CreateUserAddressDto): Promise<UserAddress> {
    const count = await this._userAddressRepository.count({
      where: { userId: user.id },
    });
    if (count >= MAX_ADDRESSES) {
      throw new BadRequestException(
        `Solo puedes tener hasta ${MAX_ADDRESSES} direcciones`,
      );
    }

    // La primera dirección siempre queda como principal.
    const isDefault = count === 0 || dto.isDefault === true;
    if (isDefault && count > 0) {
      await this.clearDefault(user.id);
    }

    const address = this._userAddressRepository.create({
      ...dto,
      userId: user.id,
      isDefault,
    });
    return await this._userAddressRepository.save(address);
  }

  async update(
    user: User,
    id: number,
    dto: UpdateUserAddressDto,
  ): Promise<UserAddress> {
    const address = await this.findMine(user, id);

    // La principal no se "desmarca": se marca OTRA como principal.
    if (dto.isDefault === false && address.isDefault) {
      throw new BadRequestException(
        'Para cambiar la principal, marca otra dirección como principal',
      );
    }
    if (dto.isDefault === true && !address.isDefault) {
      await this.clearDefault(user.id);
    }

    Object.assign(address, dto);
    return await this._userAddressRepository.save(address);
  }

  async delete(user: User, id: number): Promise<void> {
    const address = await this.findMine(user, id);
    await this._userAddressRepository.remove(address);

    // Si se borró la principal, la más antigua que quede toma su lugar.
    if (address.isDefault) {
      const oldest = await this._userAddressRepository.findOne({
        where: { userId: user.id },
        order: { createdAt: 'ASC' },
      });
      if (oldest) {
        await this._userAddressRepository.update(oldest.id, {
          isDefault: true,
        });
      }
    }
  }

  // ---------- helpers ----------

  private async findMine(user: User, id: number): Promise<UserAddress> {
    const address = await this._userAddressRepository.findOne({
      where: { id, userId: user.id },
    });
    if (!address) {
      throw new NotFoundException('Dirección no encontrada');
    }
    return address;
  }

  private async clearDefault(userId: string): Promise<void> {
    await this._userAddressRepository.update(
      { userId, isDefault: true },
      { isDefault: false },
    );
  }
}
