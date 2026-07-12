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
import { User } from '../../shared/entities/user.entity';
import { GetUser } from '../../shared/decorators/user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';
import {
  CreateOrganizationalDocs,
  DeleteOrganizationalDocs,
  FindMineOrganizationalDocs,
  FindOneOrganizationalDocs,
  UpdateMineOrganizationalDocs,
  GetPaginatedOrganizationalsDocs,
  UpdateOrganizationalDocs,
  UploadLogoDocs,
} from '../decorators/organizational.decorators';

// El CRUD es del panel ADMIN (@Roles por ruta); los endpoints `mine/*` son
// del rol NEGO y solo exigen JWT (el service resuelve el negocio del token).
@Controller('organizational')
@ApiTags('Negocios')
@UseGuards(AuthGuard())
export class OrganizationalController {
  constructor(private readonly _organizationalUC: OrganizationalUC) {}

  @Post('create')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
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
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @GetPaginatedOrganizationalsDocs()
  async getPaginated(
    @Query() params: PaginatedOrganizationalsParamsDto,
  ): Promise<ResponsePaginationDto<Organizational>> {
    return this._organizationalUC.paginatedList(params);
  }

  /**
   * Negocio del usuario autenticado (dueño/representante legal). Lo usa la
   * app del rol NEGO para la cabecera de su panel. OJO: debe declararse
   * ANTES de `:id` para que "mine" no caiga en el ParseIntPipe.
   */
  @Get('mine')
  @FindMineOrganizationalDocs()
  async findMine(@GetUser() user: User) {
    const organizational = await this._organizationalUC.findMine(user.id);
    return {
      statusCode: HttpStatus.OK,
      data: organizational,
    };
  }

  /** Edita el negocio propio (rol NEGO); ignora dueño/cuenta/estado activo. */
  @Patch('mine')
  @UpdateMineOrganizationalDocs()
  async updateMine(
    @GetUser() user: User,
    @Body() body: UpdateOrganizationalDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._organizationalUC.updateMine(user.id, body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Negocio actualizado exitosamente',
    };
  }

  /** Sube/reemplaza el logo del negocio propio (multipart, campo `file`). */
  @Post('mine/logo')
  @UploadLogoDocs()
  @UseInterceptors(FileInterceptor('file'))
  async uploadMyLogo(
    @GetUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this._organizationalUC.updateMyLogo(user.id, file);
    return {
      statusCode: HttpStatus.OK,
      message: 'Logo actualizado exitosamente',
      data,
    };
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @FindOneOrganizationalDocs()
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const organizational = await this._organizationalUC.findOne(id);
    return {
      statusCode: HttpStatus.OK,
      data: organizational,
    };
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
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
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
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
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
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
