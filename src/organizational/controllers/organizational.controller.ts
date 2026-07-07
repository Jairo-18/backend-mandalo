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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationalUC } from '../useCases/organizational.uc';
import {
  CreateOrganizationalDto,
  PaginatedOrganizationalsParamsDto,
  UpdateOrganizationalDto,
} from '../dtos/organizational.dto';
import {
  CreatedRecordResponseDto,
  DeleteRecordResponseDto,
  UpdateRecordResponseDto,
} from '../../shared/dtos/response.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import { Organizational } from '../../shared/entities/organizational.entity';
import {
  CreateOrganizationalDocs,
  DeleteOrganizationalDocs,
  FindOneOrganizationalDocs,
  GetPaginatedOrganizationalsDocs,
  UpdateOrganizationalDocs,
  UploadLogoDocs,
} from '../decorators/organizational.decorators';

@Controller('organizational')
@ApiTags('Negocios')
@UseGuards(AuthGuard())
export class OrganizationalController {
  constructor(private readonly _organizationalUC: OrganizationalUC) {}

  @Post('create')
  @CreateOrganizationalDocs()
  async create(
    @Body() body: CreateOrganizationalDto,
  ): Promise<CreatedRecordResponseDto> {
    const organizational = await this._organizationalUC.create(body);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Negocio creado exitosamente',
      data: { rowId: String(organizational.id) },
    };
  }

  @Get('paginated')
  @GetPaginatedOrganizationalsDocs()
  async getPaginated(
    @Query() params: PaginatedOrganizationalsParamsDto,
  ): Promise<ResponsePaginationDto<Organizational>> {
    return this._organizationalUC.paginatedList(params);
  }

  @Get(':id')
  @FindOneOrganizationalDocs()
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const organizational = await this._organizationalUC.findOne(id);
    return {
      statusCode: HttpStatus.OK,
      data: organizational,
    };
  }

  @Patch(':id')
  @UpdateOrganizationalDocs()
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateOrganizationalDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._organizationalUC.update(id, body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Negocio actualizado exitosamente',
    };
  }

  @Delete(':id')
  @DeleteOrganizationalDocs()
  async delete(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DeleteRecordResponseDto> {
    await this._organizationalUC.delete(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Negocio eliminado exitosamente',
    };
  }

  /** Sube/reemplaza el logo del negocio (multipart/form-data, campo `file`). */
  @Post(':id/logo')
  @UploadLogoDocs()
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this._organizationalUC.updateLogo(id, file);
    return {
      statusCode: HttpStatus.OK,
      message: 'Logo actualizado exitosamente',
      data,
    };
  }
}
