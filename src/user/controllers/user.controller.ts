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
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags } from '@nestjs/swagger';
import { MailTemplateService } from '../../shared/services/mail-template.service';
import { Throttle } from '@nestjs/throttler';
import { UserUC } from '../useCases/user.uc';
import { CreateUserDto, RegisterUserDto, UpdateUserDto } from '../dtos/user.dto';
import { PaginatedUsersParamsDto } from '../dtos/crudUser.dto';
import {
  CreatedRecordResponseDto,
  DeleteRecordResponseDto,
  UpdateRecordResponseDto,
} from '../../shared/dtos/response.dto';
import { ResponsePaginationDto } from '../../shared/dtos/pagination.dto';
import { UserPaginatedListItem } from '../interfaces/user.interface';
import { SkipApiKey } from '../../shared/decorators/skip-api-key.decorator';
import {
  CreateUserDocs,
  DeleteUserDocs,
  FindOneUserDocs,
  GetPaginatedUsersDocs,
  RegisterUserDocs,
  UpdateUserDocs,
} from '../decorators/user.decorators';

@Controller('user')
@ApiTags('Usuarios')
export class UserController {
  constructor(
    private readonly _userUC: UserUC,
    private readonly _mailTemplateService: MailTemplateService,
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

  @Post('register/delivery')
  @SkipApiKey()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RegisterUserDocs('repartidor')
  async registerDelivery(
    @Body() body: RegisterUserDto,
  ): Promise<CreatedRecordResponseDto> {
    const user = await this._userUC.registerDelivery(body);
    return {
      statusCode: HttpStatus.CREATED,
      message:
        '¡Registro exitoso! Te enviamos un correo para verificar tu cuenta.',
      data: { rowId: user.id },
    };
  }

  @Post('create')
  @UseGuards(AuthGuard())
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
  @UseGuards(AuthGuard())
  @GetPaginatedUsersDocs()
  async getPaginated(
    @Query() params: PaginatedUsersParamsDto,
  ): Promise<ResponsePaginationDto<UserPaginatedListItem>> {
    return this._userUC.paginatedList(params);
  }

  @Get(':id')
  @UseGuards(AuthGuard())
  @FindOneUserDocs()
  async findOne(@Param('id') id: string) {
    const user = await this._userUC.findOne(id);
    return {
      statusCode: HttpStatus.OK,
      data: user,
    };
  }

  @Patch(':id')
  @UseGuards(AuthGuard())
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
  @UseGuards(AuthGuard())
  @DeleteUserDocs()
  async delete(@Param('id') id: string): Promise<DeleteRecordResponseDto> {
    await this._userUC.delete(id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Usuario eliminado exitosamente',
    };
  }
}
