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
}
