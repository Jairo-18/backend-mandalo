import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { MailTemplateService } from '../../shared/services/mail-template.service';
import { Throttle } from '@nestjs/throttler';
import { UserUC } from '../useCases/user.uc';
import { RegisterDeliveryFiles } from '../services/user.service';
import {
  BecomeDeliveryDto,
  ChangeMyPasswordDto,
  CreateUserDto,
  PushTokenDto,
  RegisterUserDto,
  ResendVerificationDto,
  UpdateMyProfileDto,
  UpdateUserDto,
} from '../dtos/user.dto';
import { PushService } from '../../shared/services/push.service';
import { GetUser } from '../../shared/decorators/user.decorator';
import { User } from '../../shared/entities/user.entity';
import { PaginatedUsersParamsDto } from '../dtos/crudUser.dto';
import {
  CreatedRecordResponseDto,
  DeleteRecordResponseDto,
  UpdateRecordResponseDto,
} from '../../shared/dtos/response.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import { UserPaginatedListItem } from '../interfaces/user.interface';
import { SkipApiKey } from '../../shared/decorators/skip-api-key.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';
import {
  CreateUserDocs,
  DeleteUserDocs,
  FindOneUserDocs,
  GetPaginatedUsersDocs,
  RegisterUserDocs,
  UpdateUserDocs,
  UploadAvatarDocs,
} from '../decorators/user.decorators';

@Controller('user')
@ApiTags('Usuarios')
export class UserController {
  constructor(
    private readonly _userUC: UserUC,
    private readonly _mailTemplateService: MailTemplateService,
    private readonly _pushService: PushService,
  ) {}

  /**
   * Enlace que llega al correo de verificación. Se abre en el navegador del
   * teléfono, por eso responde una página HTML y no JSON.
   */
  @Get('verify-email')
  @SkipApiKey()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async verifyEmail(
    @Query('token') token: string,
    @Query('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    let success = true;
    let message =
      'Tu correo fue verificado. Ya puedes iniciar sesión en la app de Mándalo.';

    if (!token || !userId) {
      success = false;
      message = 'El enlace de verificación está incompleto o no es válido.';
    } else {
      try {
        await this._userUC.verifyEmail(token, userId);
      } catch (error) {
        success = false;
        message =
          error?.response?.message ||
          error?.message ||
          'No se pudo verificar tu correo. Intenta registrarte de nuevo.';
      }
    }

    res
      .status(success ? HttpStatus.OK : HttpStatus.BAD_REQUEST)
      .type('html')
      .send(this._mailTemplateService.verifyEmailResultPage(success, message));
  }

  @Post('register/client')
  @SkipApiKey()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RegisterUserDocs('cliente')
  async registerClient(
    @Body() body: RegisterUserDto,
  ): Promise<CreatedRecordResponseDto> {
    const user = await this._userUC.registerClient(body);
    return {
      statusCode: HttpStatus.CREATED,
      message:
        '¡Registro exitoso! Te enviamos un correo para verificar tu cuenta.',
      data: { rowId: user.id },
    };
  }

  /**
   * Registro de repartidor: multipart/form-data con los campos del DTO más
   * las fotos de verificación OBLIGATORIAS (`avatar`, `idFront`, `idBack`).
   * La cuenta nace inactiva; un admin revisa los documentos y la activa.
   */
  @Post('register/delivery')
  @SkipApiKey()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RegisterUserDocs('repartidor')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'avatar', maxCount: 1 },
      { name: 'idFront', maxCount: 1 },
      { name: 'idBack', maxCount: 1 },
    ]),
  )
  async registerDelivery(
    @Body() body: RegisterUserDto,
    @UploadedFiles() files: RegisterDeliveryFiles,
  ): Promise<CreatedRecordResponseDto> {
    const user = await this._userUC.registerDelivery(body, files);
    return {
      statusCode: HttpStatus.CREATED,
      message:
        '¡Registro exitoso! Verifica tu correo. Un administrador revisará tus datos y activará tu cuenta de repartidor.',
      data: { rowId: user.id },
    };
  }

  /**
   * Reenvía el correo de verificación (botón del login cuando el sign-in
   * rechaza por correo sin verificar). Público, con throttle corto.
   */
  @Post('resend-verification')
  @SkipApiKey()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async resendVerification(
    @Body() body: ResendVerificationDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._userUC.resendVerification(body.email);
    return {
      statusCode: HttpStatus.OK,
      message: 'Te reenviamos el correo de verificación. Revisa tu bandeja.',
    };
  }

  @Post('create')
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @CreateUserDocs()
  async create(
    @Body() body: CreateUserDto,
  ): Promise<CreatedRecordResponseDto> {
    const user = await this._userUC.create(body);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Usuario creado exitosamente',
      data: { rowId: user.id },
    };
  }

  @Get('paginated')
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @GetPaginatedUsersDocs()
  async getPaginated(
    @Query() params: PaginatedUsersParamsDto,
  ): Promise<ResponsePaginationDto<UserPaginatedListItem>> {
    return this._userUC.paginatedList(params);
  }

  /**
   * ---- Endpoints del PROPIO usuario (self-scoped por el JWT) ----
   * Declarados ANTES de ':id' para que "me" no se interprete como un id
   * (mismo patrón que /organizational/mine).
   */

  /** Perfil del usuario autenticado (con relaciones para el form del front). */
  @Get('me')
  @UseGuards(AuthGuard())
  async getMe(@GetUser() user: User) {
    const data = await this._userUC.findOne(user.id);
    return {
      statusCode: HttpStatus.OK,
      data,
    };
  }

  /** Edición del propio perfil (DTO restringido: sin campos de admin/email). */
  @Patch('me')
  @UseGuards(AuthGuard())
  async updateMe(
    @GetUser() user: User,
    @Body() body: UpdateMyProfileDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._userUC.updateMyProfile(user.id, body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Perfil actualizado exitosamente',
    };
  }

  /** Cambio de contraseña con la contraseña actual como prueba. */
  @Patch('me/password')
  @UseGuards(AuthGuard())
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changeMyPassword(
    @GetUser() user: User,
    @Body() body: ChangeMyPasswordDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._userUC.changePassword(user.id, body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Contraseña actualizada exitosamente',
    };
  }

  /**
   * Onboarding post-Google: convierte la cuenta autenticada en REPARTIDOR.
   * Multipart con la identificación + las fotos de verificación (mismas del
   * registro DELI). La cuenta queda inactiva hasta que un admin la revise.
   */
  @Post('me/become-delivery')
  @UseGuards(AuthGuard())
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'avatar', maxCount: 1 },
      { name: 'idFront', maxCount: 1 },
      { name: 'idBack', maxCount: 1 },
    ]),
  )
  async becomeDelivery(
    @GetUser() user: User,
    @Body() body: BecomeDeliveryDto,
    @UploadedFiles() files: RegisterDeliveryFiles,
  ): Promise<UpdateRecordResponseDto> {
    await this._userUC.becomeDelivery(user.id, body, files);
    return {
      statusCode: HttpStatus.OK,
      message:
        '¡Listo! Un administrador revisará tus datos y activará tu cuenta de repartidor.',
    };
  }

  /** Sube/reemplaza la propia foto de perfil (multipart, campo `file`). */
  @Post('me/avatar')
  @UseGuards(AuthGuard())
  @UseInterceptors(FileInterceptor('file'))
  async uploadMyAvatar(
    @GetUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this._userUC.updateAvatar(user.id, file);
    return {
      statusCode: HttpStatus.OK,
      message: 'Foto de perfil actualizada',
      data,
    };
  }

  /**
   * Registro del token de notificaciones push del dispositivo (lo manda la
   * app al iniciar sesión). Un usuario puede tener varios dispositivos.
   */
  @Post('me/push-token')
  @UseGuards(AuthGuard())
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async registerPushToken(
    @GetUser() user: User,
    @Body() body: PushTokenDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._pushService.register(user.id, body.token);
    return {
      statusCode: HttpStatus.OK,
      message: 'Notificaciones activadas en este dispositivo',
    };
  }

  /** El logout del dispositivo retira su token (deja de recibir push). */
  @Delete('me/push-token')
  @UseGuards(AuthGuard())
  async unregisterPushToken(
    @GetUser() user: User,
    @Body() body: PushTokenDto,
  ): Promise<DeleteRecordResponseDto> {
    await this._pushService.unregister(user.id, body.token);
    return {
      statusCode: HttpStatus.OK,
      message: 'Notificaciones desactivadas en este dispositivo',
    };
  }

  @Get(':id')
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @FindOneUserDocs()
  async findOne(@Param('id') id: string) {
    const user = await this._userUC.findOne(id);
    return {
      statusCode: HttpStatus.OK,
      data: user,
    };
  }

  @Patch(':id')
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @UpdateUserDocs()
  async update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
  ): Promise<UpdateRecordResponseDto> {
    await this._userUC.update(id, body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Usuario actualizado exitosamente',
    };
  }

  @Delete(':id')
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @DeleteUserDocs()
  async delete(@Param('id') id: string): Promise<DeleteRecordResponseDto> {
    await this._userUC.delete(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Usuario eliminado exitosamente',
    };
  }

  /** Sube/reemplaza la foto de perfil (multipart/form-data, campo `file`). */
  @Post(':id/avatar')
  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(RoleTypeCode.ADMIN)
  @UploadAvatarDocs()
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const data = await this._userUC.updateAvatar(id, file);
    return {
      statusCode: HttpStatus.OK,
      message: 'Foto de perfil actualizada',
      data,
    };
  }
}
