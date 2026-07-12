import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { TagUC } from '../useCases/tag.uc';
import {
  CreateTagDto,
  PaginatedTagsParamsDto,
  UpdateTagDto,
} from '../dtos/tag.dto';
import {
  CreatedRecordResponseDto,
  DeleteRecordResponseDto,
  UpdateRecordResponseDto,
} from '../../shared/dtos/response.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import { Tag } from '../../shared/entities/tag.entity';
import {
  CreateTagDocs,
  DeleteTagDocs,
  FindOneTagDocs,
  GetPaginatedTagsDocs,
  UpdateTagDocs,
} from '../decorators/tag.decorators';
import { Roles } from '../../shared/decorators/roles.decorator';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';

// Escrituras solo ADMIN; las lecturas quedan con JWT porque el panel del
// NEGO también las usa (chips de etiquetas en "Editar mi negocio").
@Controller('tag')
@ApiTags('Etiquetas de negocio')
@UseGuards(AuthGuard())
export class TagController {
  constructor(private readonly _tagUC: TagUC) {}

  @Post('create')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @CreateTagDocs()
  async create(@Body() body: CreateTagDto): Promise<CreatedRecordResponseDto> {
    const tag = await this._tagUC.create(body);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Etiqueta creada exitosamente',
      data: { rowId: tag.id },
    };
  }

  @Get('paginated')
  @GetPaginatedTagsDocs()
  async getPaginated(
    @Query() params: PaginatedTagsParamsDto,
  ): Promise<ResponsePaginationDto<Tag>> {
    return this._tagUC.paginatedList(params);
  }

  @Get(':id')
  @FindOneTagDocs()
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const tag = await this._tagUC.findOne(id);
    return {
      statusCode: HttpStatus.OK,
      data: tag,
    };
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @UpdateTagDocs()
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTagDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._tagUC.update(id, body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Etiqueta actualizada exitosamente',
    };
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @DeleteTagDocs()
  async delete(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DeleteRecordResponseDto> {
    await this._tagUC.delete(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Etiqueta eliminada exitosamente',
    };
  }
}
