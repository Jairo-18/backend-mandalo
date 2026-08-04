import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { DeliveryAccidentUC } from '../useCases/deliveryAccident.uc';
import {
  PaginatedAccidentsParamsDto,
  ReportAccidentDto,
} from '../dtos/deliveryAccident.dto';
import { UpdateRecordResponseDto } from '../../shared/dtos/response.dto';
import { User } from '../../shared/entities/user.entity';
import { GetUser } from '../../shared/decorators/user.decorator';

/**
 * Reportes de accidente de repartidores (solo ADMIN los administra, el
 * repartidor solo reporta — validado dentro del service). Ver §68 de NOTAS.
 */
@Controller('delivery-accident')
@ApiTags('Accidentes de repartidores')
@UseGuards(AuthGuard())
export class DeliveryAccidentController {
  constructor(private readonly _uc: DeliveryAccidentUC) {}

  @Post('report')
  @UseInterceptors(FilesInterceptor('photos', 5))
  async report(
    @GetUser() user: User,
    @Body() body: ReportAccidentDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    const data = await this._uc.report(user, body, files);
    return {
      statusCode: HttpStatus.OK,
      message: 'Reportamos tu accidente. Ya avisamos a los administradores.',
      data,
    };
  }

  @Get('paginated')
  async paginated(
    @GetUser() user: User,
    @Query() params: PaginatedAccidentsParamsDto,
  ) {
    return this._uc.paginated(user, params);
  }

  // Antes de :id (literal, no numérico).
  @Get('unreviewed-count')
  async unreviewedCount(@GetUser() user: User) {
    const total = await this._uc.unreviewedCount(user);
    return { statusCode: HttpStatus.OK, data: { total } };
  }

  @Get(':id')
  async findOne(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const data = await this._uc.findOne(user, id);
    return { statusCode: HttpStatus.OK, data };
  }

  @Patch(':id/review')
  async review(
    @GetUser() user: User,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<UpdateRecordResponseDto> {
    await this._uc.review(user, id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Accidente marcado como atendido.',
    };
  }
}
