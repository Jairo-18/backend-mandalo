import { Injectable } from '@nestjs/common';
import { TagService } from '../services/tag.service';
import {
  CreateTagDto,
  PaginatedTagsParamsDto,
  UpdateTagDto,
} from '../dtos/tag.dto';

@Injectable()
export class TagUC {
  constructor(private readonly _tagService: TagService) {}

  create(dto: CreateTagDto) {
    return this._tagService.create(dto);
  }

  findOne(id: number) {
    return this._tagService.findOne(id);
  }

  paginatedList(params: PaginatedTagsParamsDto) {
    return this._tagService.paginatedList(params);
  }

  update(id: number, dto: UpdateTagDto) {
    return this._tagService.update(id, dto);
  }

  delete(id: number) {
    return this._tagService.delete(id);
  }
}
