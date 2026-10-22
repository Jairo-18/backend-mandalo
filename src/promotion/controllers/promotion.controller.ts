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
import { AuthGuard } from '@nestjs/passport';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { PromotionService } from '../services/promotion.service';
import {
  CreatePromotionDto,
  PromotionFeedParamsDto,
  SetPromotionHiddenDto,
  UpdatePromotionDto,
} from '../dtos/promotion.dto';
import { User } from '../../shared/entities/user.entity';
import { GetUser } from '../../shared/decorators/user.decorator';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';

/**
 * Publicidad de los negocios. El carrusel del home y la tienda son PÚBLICOS
 * (también los ve el invitado, igual que /explore); lo demás exige sesión:
 * el negocio gestiona las suyas y el admin modera. Guard por método.
 */
@Controller('promotion')
@ApiTags('Publicidad (promociones)')
export class PromotionController {
  constructor(private readonly _promotionService: PromotionService) {}

  // ---------- público ----------

  // Públicos e iguales para todos: caché por URL (Redis en prod, §21), como
  // /explore. Un cambio del negocio tarda hasta 1 min en verse acá.
  @Get('feed')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60_000)
  async feed(@Query() params: PromotionFeedParamsDto) {
    const data = await this._promotionService.feed(params);
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('business/:id')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60_000)
  async forBusiness(@Param('id', ParseIntPipe) id: number) {
    const data = await this._promotionService.forBusiness(id);
    return { statusCode: HttpStatus.OK, data };
  }

  // ---------- negocio ----------

  @Get('mine')
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(RoleTypeCode.BUSINESS)
  async mine(@GetUser() user: User) {
    const data = await this._promotionService.mine(user);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post()
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(RoleTypeCode.BUSINESS)
  async create(@GetUser() user: User, @Body() body: CreatePromotionDto) {
    const data = await this._promotionService.create(user, body);
    return { statusCode: HttpStatus.CREATED, message: 'Promoción publicada', data };
  }

  @Patch(':id')
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(RoleTypeCode.BUSINESS)
  async update(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePromotionDto,
  ) {
    const data = await this._promotionService.update(user, id, body);
    return { statusCode: HttpStatus.OK, message: 'Promoción actualizada', data };
  }

  /** Banner (multipart, campo `file`): el servidor lo recorta 16:9. */
  @Post(':id/image')
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(RoleTypeCode.BUSINESS)
  @UseInterceptors(FileInterceptor('file'))
  async setImage(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this._promotionService.setImage(user, id, file);
    return { statusCode: HttpStatus.OK, data };
  }

  /** La borra el negocio dueño o un admin (moderación). */
  @Delete(':id')
  @UseGuards(AuthGuard())
  async remove(@GetUser() user: User, @Param('id', ParseIntPipe) id: number) {
    await this._promotionService.remove(user, id);
    return { statusCode: HttpStatus.OK, message: 'Promoción eliminada' };
  }

  // ---------- admin ----------

  @Get('admin/business/:id')
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  async adminForBusiness(
    @GetUser() admin: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this._promotionService.adminForBusiness(admin, id);
    return { statusCode: HttpStatus.OK, data };
  }

  @Patch(':id/hidden')
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  async setHidden(
    @GetUser() admin: User,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetPromotionHiddenDto,
  ) {
    await this._promotionService.setHidden(admin, id, body.hidden);
    return {
      statusCode: HttpStatus.OK,
      message: body.hidden ? 'Promoción oculta' : 'Promoción visible de nuevo',
    };
  }
}
