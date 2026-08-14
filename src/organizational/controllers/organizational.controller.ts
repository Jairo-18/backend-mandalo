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
  ResolveMapsUrlDto,
  ReverseGeocodeDto,
  SearchAddressDto,
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
  ResolveMapsUrlDocs,
  SearchAddressDocs,
  ReverseGeocodeDocs,
  UpdateOrganizationalDocs,
  UploadLogoDocs,
  UploadPaymentQrDocs,
  RemoveLogoDocs,
  RemovePaymentQrDocs,
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
    @GetUser() user: User,
    @Body() body: CreateOrganizationalDto,
  ): Promise<CreatedRecordResponseDto> {
    const organizational = await this._organizationalUC.create(body, user);
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
    @GetUser() user: User,
    @Query() params: PaginatedOrganizationalsParamsDto,
  ): Promise<ResponsePaginationDto<Organizational>> {
    return this._organizationalUC.paginatedList(user, params);
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

  /** Sube/reemplaza el QR de Bancolombia del negocio propio (rol NEGO). */
  @Post('mine/payment-qr')
  @UploadPaymentQrDocs()
  @UseInterceptors(FileInterceptor('file'))
  async uploadMyPaymentQr(
    @GetUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this._organizationalUC.updateMyPaymentQr(user.id, file);
    return {
      statusCode: HttpStatus.OK,
      message: 'QR de pago actualizado exitosamente',
      data,
    };
  }

  /** Quita el logo del negocio propio (opcional, sin reemplazo). */
  @Delete('mine/logo')
  @RemoveLogoDocs()
  async removeMyLogo(@GetUser() user: User): Promise<DeleteRecordResponseDto> {
    await this._organizationalUC.removeMyLogo(user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Logo eliminado exitosamente',
    };
  }

  /** Quita el QR de Bancolombia del negocio propio (opcional, sin reemplazo). */
  @Delete('mine/payment-qr')
  @RemovePaymentQrDocs()
  async removeMyPaymentQr(
    @GetUser() user: User,
  ): Promise<DeleteRecordResponseDto> {
    await this._organizationalUC.removeMyPaymentQr(user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'QR de pago eliminado exitosamente',
    };
  }

  /**
   * Link "Compartir" acortado de Google Maps → URL final ya con coordenadas.
   * El front la parsea con la misma lógica de siempre (`extractCoordsFromMapsUrl`).
   * OJO: debe declararse ANTES de `:id` para que no caiga en el ParseIntPipe.
   */
  @Get('resolve-maps-url')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @ResolveMapsUrlDocs()
  async resolveMapsUrl(@Query() query: ResolveMapsUrlDto) {
    const finalUrl = await this._organizationalUC.resolveMapsUrl(query.url);
    return {
      statusCode: HttpStatus.OK,
      data: { finalUrl },
    };
  }

  /**
   * Buscar dirección/lugar (Nominatim) → candidatos con coordenadas.
   * OJO: debe declararse ANTES de `:id` para que no caiga en el ParseIntPipe.
   */
  @Get('search-address')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @SearchAddressDocs()
  async searchAddress(@Query() query: SearchAddressDto) {
    const data = await this._organizationalUC.searchAddress(query.q);
    return { statusCode: HttpStatus.OK, data };
  }

  /**
   * Coordenadas → dirección legible (pin movido a mano en el mapa).
   * OJO: debe declararse ANTES de `:id` para que no caiga en el ParseIntPipe.
   */
  @Get('reverse-geocode')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @ReverseGeocodeDocs()
  async reverseGeocode(@Query() query: ReverseGeocodeDto) {
    const label = await this._organizationalUC.reverseGeocode(
      query.latitude,
      query.longitude,
    );
    return { statusCode: HttpStatus.OK, data: { label } };
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @FindOneOrganizationalDocs()
  async findOne(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const organizational = await this._organizationalUC.findOne(id, user);
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
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateOrganizationalDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._organizationalUC.update(id, body, user);
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
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DeleteRecordResponseDto> {
    await this._organizationalUC.delete(id, user);
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
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this._organizationalUC.updateLogo(id, file, user);
    return {
      statusCode: HttpStatus.OK,
      message: 'Logo actualizado exitosamente',
      data,
    };
  }

  /** Quita el logo del negocio (admin, sin reemplazo). */
  @Delete(':id/logo')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @RemoveLogoDocs()
  async removeLogo(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DeleteRecordResponseDto> {
    await this._organizationalUC.removeLogo(id, user);
    return {
      statusCode: HttpStatus.OK,
      message: 'Logo eliminado exitosamente',
    };
  }

  /** Sube/reemplaza el QR de Bancolombia del negocio (admin). */
  @Post(':id/payment-qr')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @UploadPaymentQrDocs()
  @UseInterceptors(FileInterceptor('file'))
  async uploadPaymentQr(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this._organizationalUC.updatePaymentQr(id, file, user);
    return {
      statusCode: HttpStatus.OK,
      message: 'QR de pago actualizado exitosamente',
      data,
    };
  }

  /** Quita el QR de Bancolombia del negocio (admin, sin reemplazo). */
  @Delete(':id/payment-qr')
  @UseGuards(RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @RemovePaymentQrDocs()
  async removePaymentQr(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<DeleteRecordResponseDto> {
    await this._organizationalUC.removePaymentQr(id, user);
    return {
      statusCode: HttpStatus.OK,
      message: 'QR de pago eliminado exitosamente',
    };
  }
}
