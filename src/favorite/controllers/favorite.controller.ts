import {
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { FavoriteService } from '../services/favorite.service';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';
import { User } from '../../shared/entities/user.entity';
import { GetUser } from '../../shared/decorators/user.decorator';

/**
 * Favoritos del usuario logueado (cualquier rol: un repartidor o un negocio
 * también pide como cliente). El invitado no tiene favoritos: la app le pide
 * iniciar sesión al tocar el corazón.
 */
@Controller('favorite')
@ApiTags('Favoritos (cliente)')
@UseGuards(AuthGuard())
export class FavoriteController {
  constructor(private readonly _favoriteService: FavoriteService) {}

  /** Solo los ids (liviano): para pintar los corazones en todas las tarjetas. */
  @Get('ids')
  async ids(@GetUser() user: User) {
    const data = await this._favoriteService.ids(user);
    return { statusCode: HttpStatus.OK, data };
  }

  @Get('businesses')
  businesses(@GetUser() user: User, @Query() params: ParamsPaginationDto) {
    return this._favoriteService.businesses(user, params);
  }

  @Get('products')
  products(@GetUser() user: User, @Query() params: ParamsPaginationDto) {
    return this._favoriteService.products(user, params);
  }

  @Put('business/:id')
  async addBusiness(@GetUser() user: User, @Param('id', ParseIntPipe) id: number) {
    await this._favoriteService.addBusiness(user, id);
    return { statusCode: HttpStatus.OK, message: 'Guardado en favoritos' };
  }

  @Delete('business/:id')
  async removeBusiness(@GetUser() user: User, @Param('id', ParseIntPipe) id: number) {
    await this._favoriteService.removeBusiness(user, id);
    return { statusCode: HttpStatus.OK, message: 'Quitado de favoritos' };
  }

  @Put('product/:id')
  async addProduct(@GetUser() user: User, @Param('id', ParseIntPipe) id: number) {
    await this._favoriteService.addProduct(user, id);
    return { statusCode: HttpStatus.OK, message: 'Guardado en favoritos' };
  }

  @Delete('product/:id')
  async removeProduct(@GetUser() user: User, @Param('id', ParseIntPipe) id: number) {
    await this._favoriteService.removeProduct(user, id);
    return { statusCode: HttpStatus.OK, message: 'Quitado de favoritos' };
  }
}
