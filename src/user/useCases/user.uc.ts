import { Injectable } from '@nestjs/common';
import { UserService } from '../services/user.service';
import { CrudUserService } from '../services/crudUser.service';
import { CreateUserDto, RegisterUserDto, UpdateUserDto } from '../dtos/user.dto';
import { PaginatedUsersParamsDto } from '../dtos/crudUser.dto';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';

@Injectable()
export class UserUC {
  constructor(
    private readonly _userService: UserService,
    private readonly _crudUserService: CrudUserService,
  ) {}

  create(dto: CreateUserDto) {
    return this._userService.create(dto);
  }

  registerClient(dto: RegisterUserDto) {
    return this._userService.register(dto, RoleTypeCode.CLIENT);
  }

  registerDelivery(dto: RegisterUserDto) {
    return this._userService.register(dto, RoleTypeCode.DELIVERY);
  }

  verifyEmail(token: string, userId: string) {
    return this._userService.verifyEmail(token, userId);
  }

  findOne(id: string) {
    return this._userService.findOne(id);
  }

  paginatedList(params: PaginatedUsersParamsDto) {
    return this._crudUserService.paginatedList(params);
  }

  update(id: string, dto: UpdateUserDto) {
    return this._userService.update(id, dto);
  }

  delete(id: string) {
    return this._userService.delete(id);
  }
}
