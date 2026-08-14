import { Injectable } from '@nestjs/common';
import { OrganizationalService } from '../services/organizational.service';
import { User } from '../../shared/entities/user.entity';
import {
  CreateOrganizationalDto,
  PaginatedOrganizationalsParamsDto,
  UpdateOrganizationalDto,
} from '../dtos/organizational.dto';

@Injectable()
export class OrganizationalUC {
  constructor(
    private readonly _organizationalService: OrganizationalService,
  ) {}

  create(dto: CreateOrganizationalDto, admin?: User) {
    return this._organizationalService.create(dto, admin);
  }

  findOne(id: number, admin?: User) {
    return this._organizationalService.findOne(id, admin);
  }

  findMine(userId: string) {
    return this._organizationalService.findMine(userId);
  }

  updateMine(userId: string, dto: UpdateOrganizationalDto) {
    return this._organizationalService.updateMine(userId, dto);
  }

  updateMyLogo(userId: string, file: Express.Multer.File) {
    return this._organizationalService.updateMyLogo(userId, file);
  }

  paginatedList(admin: User, params: PaginatedOrganizationalsParamsDto) {
    return this._organizationalService.paginatedList(admin, params);
  }

  update(id: number, dto: UpdateOrganizationalDto, admin?: User) {
    return this._organizationalService.update(id, dto, admin);
  }

  delete(id: number, admin?: User) {
    return this._organizationalService.delete(id, admin);
  }

  updateLogo(id: number, file: Express.Multer.File, admin?: User) {
    return this._organizationalService.updateLogo(id, file, admin);
  }

  updatePaymentQr(id: number, file: Express.Multer.File, admin?: User) {
    return this._organizationalService.updatePaymentQr(id, file, admin);
  }

  updateMyPaymentQr(userId: string, file: Express.Multer.File) {
    return this._organizationalService.updateMyPaymentQr(userId, file);
  }

  removeLogo(id: number, admin?: User) {
    return this._organizationalService.removeLogo(id, admin);
  }

  removeMyLogo(userId: string) {
    return this._organizationalService.removeMyLogo(userId);
  }

  removePaymentQr(id: number, admin?: User) {
    return this._organizationalService.removePaymentQr(id, admin);
  }

  removeMyPaymentQr(userId: string) {
    return this._organizationalService.removeMyPaymentQr(userId);
  }

  resolveMapsUrl(url: string) {
    return this._organizationalService.resolveMapsUrl(url);
  }

  searchAddress(query: string) {
    return this._organizationalService.searchAddress(query);
  }

  reverseGeocode(latitude: number, longitude: number) {
    return this._organizationalService.reverseGeocode(latitude, longitude);
  }
}
