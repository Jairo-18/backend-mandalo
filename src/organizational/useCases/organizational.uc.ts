import { Injectable } from '@nestjs/common';
import { OrganizationalService } from '../services/organizational.service';
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

  create(dto: CreateOrganizationalDto) {
    return this._organizationalService.create(dto);
  }

  findOne(id: number) {
    return this._organizationalService.findOne(id);
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

  paginatedList(params: PaginatedOrganizationalsParamsDto) {
    return this._organizationalService.paginatedList(params);
  }

  update(id: number, dto: UpdateOrganizationalDto) {
    return this._organizationalService.update(id, dto);
  }

  delete(id: number) {
    return this._organizationalService.delete(id);
  }

  updateLogo(id: number, file: Express.Multer.File) {
    return this._organizationalService.updateLogo(id, file);
  }

  updatePaymentQr(id: number, file: Express.Multer.File) {
    return this._organizationalService.updatePaymentQr(id, file);
  }

  updateMyPaymentQr(userId: string, file: Express.Multer.File) {
    return this._organizationalService.updateMyPaymentQr(userId, file);
  }
}
