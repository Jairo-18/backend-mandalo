import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Patch,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { AppSettingsUC } from '../useCases/appSettings.uc';
import { UpdateAppSettingsDto } from '../dtos/appSettings.dto';
import { UpdateRecordResponseDto } from '../../shared/dtos/response.dto';
import { SkipApiKey } from '../../shared/decorators/skip-api-key.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';

/**
 * Paleta de marca de la app (§50 en NOTAS.md): el admin la edita desde
 * "Aplicación" en su panel. La lectura es pública (como `/catalog`): la app
 * la pide en el splash, antes de que haya sesión.
 */
@Controller('app-settings')
@ApiTags('Configuración de la app')
export class AppSettingsController {
  constructor(private readonly _appSettingsUC: AppSettingsUC) {}

  @Get()
  @SkipApiKey()
  // La pide CADA arranque de la app, de TODOS los usuarios, antes de que
  // haya sesión (splash) — casi nunca cambia (solo la edita el admin), así
  // que se cachea igual que `/catalog` (§21 de NOTAS) en vez de golpear la
  // DB en cada apertura.
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(10 * 60_000)
  async get() {
    const data = await this._appSettingsUC.get();
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  @Patch()
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  async update(
    @Body() body: UpdateAppSettingsDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._appSettingsUC.update(body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Colores actualizados exitosamente',
    };
  }
}
