import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ReviewUC } from '../useCases/review.uc';
import { CreateReviewDto } from '../dtos/review.dto';
import { User } from '../../shared/entities/user.entity';
import { GetUser } from '../../shared/decorators/user.decorator';
import { ParamsPaginationDto } from '../../shared/dtos/pagination.dto';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';

/**
 * Reseñas entre las partes de un pedido entregado. Las del NEGOCIO son
 * públicas (el invitado las ve en el home, igual que /explore); el resto
 * exige sesión. El guard va por método, no por controller, por eso.
 */
@Controller('review')
@ApiTags('Reseñas')
export class ReviewController {
  constructor(private readonly _reviewUC: ReviewUC) {}

  /** Qué puedo calificar en este pedido y lo que ya califiqué. */
  @Get('invoice/:invoiceId')
  @UseGuards(AuthGuard())
  async statusForInvoice(
    @GetUser() user: User,
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
  ) {
    const data = await this._reviewUC.statusForInvoice(user, invoiceId);
    return { statusCode: HttpStatus.OK, data };
  }

  @Post('invoice/:invoiceId')
  @UseGuards(AuthGuard())
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async create(
    @GetUser() user: User,
    @Param('invoiceId', ParseIntPipe) invoiceId: number,
    @Body() body: CreateReviewDto,
  ) {
    const data = await this._reviewUC.create(user, invoiceId, body);
    return {
      statusCode: HttpStatus.CREATED,
      message: '¡Gracias por tu calificación!',
      data,
    };
  }

  /** "Mis reseñas": las que recibí (el negocio, las de su negocio). */
  @Get('mine')
  @UseGuards(AuthGuard())
  async mine(@GetUser() user: User, @Query() params: ParamsPaginationDto) {
    const data = await this._reviewUC.mine(user, params);
    return { statusCode: HttpStatus.OK, data };
  }

  /** Reseñas de un negocio (público: home y tienda, también invitados). */
  @Get('business/:id')
  async forBusiness(
    @Param('id', ParseIntPipe) id: number,
    @Query() params: ParamsPaginationDto,
  ) {
    const data = await this._reviewUC.forBusiness(id, params);
    return { statusCode: HttpStatus.OK, data };
  }

  /** Reseñas de un cliente o repartidor (con sesión). */
  @Get('user/:id')
  @UseGuards(AuthGuard())
  async forUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() params: ParamsPaginationDto,
  ) {
    const data = await this._reviewUC.forUser(id, params);
    return { statusCode: HttpStatus.OK, data };
  }

  /** Moderación: el admin borra una reseña (groserías, reseña falsa…). */
  @Delete(':id')
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  async remove(@GetUser() user: User, @Param('id', ParseIntPipe) id: number) {
    await this._reviewUC.remove(user, id);
    return { statusCode: HttpStatus.OK, message: 'Reseña eliminada' };
  }
}
