import { Injectable } from '@nestjs/common';
import { RegisterDeliveryFiles, UserService } from '../services/user.service';
import { CrudUserService } from '../services/crudUser.service';
import {
  BecomeDeliveryDto,
  BulkInviteUsersDto,
  BusinessLeadDto,
  ChangeMyPasswordDto,
  CreateUserDto,
  RegisterUserDto,
  ResendDeliveryDocumentsDto,
  UpdateMyProfileDto,
  UpdateUserDto,
} from '../dtos/user.dto';
import { PaginatedUsersParamsDto } from '../dtos/crudUser.dto';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';
import { User } from '../../shared/entities/user.entity';

@Injectable()
export class UserUC {
  constructor(
    private readonly _userService: UserService,
    private readonly _crudUserService: CrudUserService,
  ) {}

  create(dto: CreateUserDto, admin?: User) {
    return this._userService.create(dto, admin);
  }

  bulkInvite(dto: BulkInviteUsersDto) {
    return this._userService.bulkInvite(dto);
  }

  registerClient(dto: RegisterUserDto) {
    return this._userService.register(dto, RoleTypeCode.CLIENT);
  }

  registerDelivery(dto: RegisterUserDto, files: RegisterDeliveryFiles) {
    return this._userService.register(dto, RoleTypeCode.DELIVERY, files);
  }

  verifyEmail(token: string, userId: string) {
    return this._userService.verifyEmail(token, userId);
  }

  resendVerification(email: string) {
    return this._userService.resendVerification(email);
  }

  findOne(id: string, admin?: User) {
    return this._userService.findOne(id, admin);
  }

  paginatedList(admin: User, params: PaginatedUsersParamsDto) {
    return this._crudUserService.paginatedList(admin, params);
  }

  update(id: string, dto: UpdateUserDto, admin?: User) {
    return this._userService.update(id, dto, admin);
  }

  /** Edición del propio perfil (DTO restringido, sin campos de admin). */
  updateMyProfile(id: string, dto: UpdateMyProfileDto) {
    return this._userService.update(id, dto);
  }

  /** Onboarding post-Google: la cuenta se convierte en repartidor (inactiva). */
  becomeDelivery(id: string, dto: BecomeDeliveryDto, files: RegisterDeliveryFiles) {
    return this._userService.becomeDelivery(id, dto, files);
  }

  /** Reenvío de documentos del repartidor (corregir un rechazo o renovar uno vencido). */
  resendDeliveryDocuments(
    id: string,
    dto: ResendDeliveryDocumentsDto,
    files: RegisterDeliveryFiles,
  ) {
    return this._userService.resendDeliveryDocuments(id, dto, files);
  }

  /** Registra la aceptación de términos del usuario (y de su negocio si lo tiene). */
  acceptTerms(id: string) {
    return this._userService.acceptTerms(id);
  }

  changePassword(id: string, dto: ChangeMyPasswordDto) {
    return this._userService.changePassword(
      id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  delete(id: string, admin?: User) {
    return this._userService.delete(id, admin);
  }

  requestSelfDeletion(id: string) {
    return this._userService.requestSelfDeletion(id);
  }

  requestDeletionByEmail(email: string) {
    return this._userService.requestDeletionByEmail(email);
  }

  sendBusinessLead(dto: BusinessLeadDto) {
    return this._userService.sendBusinessLead(dto);
  }

  confirmDeletionByToken(userId: string, token: string) {
    return this._userService.confirmDeletionByToken(userId, token);
  }

  updateAvatar(id: string, file: Express.Multer.File, admin?: User) {
    return this._userService.updateAvatar(id, file, admin);
  }

  removeAvatar(id: string, admin?: User) {
    return this._userService.removeAvatar(id, admin);
  }
}
