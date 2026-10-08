import { Injectable } from '@nestjs/common';
import { UserAddressService } from '../services/userAddress.service';
import { User } from '../../shared/entities/user.entity';
import {
  CreateUserAddressDto,
  UpdateUserAddressDto,
} from '../dtos/userAddress.dto';

@Injectable()
export class UserAddressUC {
  constructor(private readonly _userAddressService: UserAddressService) {}

  listMine(user: User) {
    return this._userAddressService.listMine(user);
  }

  create(user: User, dto: CreateUserAddressDto) {
    return this._userAddressService.create(user, dto);
  }

  update(user: User, id: number, dto: UpdateUserAddressDto) {
    return this._userAddressService.update(user, id, dto);
  }

  setPhoto(user: User, id: number, file: Express.Multer.File) {
    return this._userAddressService.setPhoto(user, id, file);
  }

  removePhoto(user: User, id: number) {
    return this._userAddressService.removePhoto(user, id);
  }

  delete(user: User, id: number) {
    return this._userAddressService.delete(user, id);
  }
}
