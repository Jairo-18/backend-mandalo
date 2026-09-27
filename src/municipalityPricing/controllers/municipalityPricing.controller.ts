import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../shared/decorators/user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';
import { User } from '../../shared/entities/user.entity';
import { MunicipalityPricingUC } from '../useCases/municipalityPricing.uc';
import { UpdateMunicipalityPricingDto } from '../dtos/municipalityPricing.dto';

/**
 * Tarifas por municipio (panel admin "Tarifas"). `@Roles(ADMIN)` deja pasar
 * también al SUPERADMIN (ver RolesGuard); el alcance por municipio lo aplica
 * el service. La tarifa general es solo SUPERADMIN.
 */
@Controller('municipality-pricing')
@ApiTags('Tarifas por municipio')
@UseGuards(AuthGuard(), RolesGuard)
export class MunicipalityPricingController {
  constructor(private readonly _uc: MunicipalityPricingUC) {}

  @Get()
  @Roles(RoleTypeCode.ADMIN)
  async overview(@GetUser() user: User) {
    return {
      statusCode: HttpStatus.OK,
      data: await this._uc.overview(user),
    };
  }

  @Patch('general')
  @Roles(RoleTypeCode.SUPERADMIN)
  async updateGeneral(
    @GetUser() user: User,
    @Body() body: UpdateMunicipalityPricingDto,
  ) {
    return {
      statusCode: HttpStatus.OK,
      message: 'Tarifa general actualizada',
      data: await this._uc.updateGeneral(user, body),
    };
  }

  @Patch('municipality/:municipalityId')
  @Roles(RoleTypeCode.ADMIN)
  async updateMunicipality(
    @GetUser() user: User,
    @Param('municipalityId', ParseIntPipe) municipalityId: number,
    @Body() body: UpdateMunicipalityPricingDto,
  ) {
    return {
      statusCode: HttpStatus.OK,
      message: 'Tarifa del municipio actualizada',
      data: await this._uc.updateMunicipality(user, municipalityId, body),
    };
  }

  @Delete('municipality/:municipalityId')
  @Roles(RoleTypeCode.ADMIN)
  async resetMunicipality(
    @GetUser() user: User,
    @Param('municipalityId', ParseIntPipe) municipalityId: number,
  ) {
    await this._uc.resetMunicipality(user, municipalityId);
    return {
      statusCode: HttpStatus.OK,
      message: 'El municipio volvió a la tarifa general',
    };
  }
}
