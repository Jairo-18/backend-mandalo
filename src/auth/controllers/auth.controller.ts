import {
  ForgotPasswordDto,
  GoogleSignInDto,
  LoginDto,
  MessageResponseDto,
  RefreshTokenBodyDto,
  ResetPasswordDto,
  SignOutBodyDto,
  SignOutResponseDto,
  SignInResponseDto,
  RefreshTokenResponseDto,
} from '../dtos/auth.dto';
import { AuthUC } from '../useCases/auth.UC';
import { Body, Controller, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import {
  SignInDocs,
  RefreshTokenDocs,
  SignOutDocs,
} from '../decorators/auth.decorators';
import { SkipApiKey } from '../../shared/decorators/skip-api-key.decorator';
import { GetUser } from '../../shared/decorators/user.decorator';
import { User } from '../../shared/entities/user.entity';

@Controller('auth')
@ApiTags('Autenticación')
export class AuthController {
  constructor(private readonly _authUC: AuthUC) {}

  @Post('/sign-in')
  @SkipApiKey()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @SignInDocs()
  async signIn(@Body() body: LoginDto): Promise<SignInResponseDto> {
    const data = await this._authUC.login(body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Bienvenid@',
      data: {
        tokens: data.tokens,
        user: data.user,
        accessSessionId: data.session?.accessSessionId,
      },
    };
  }

  @Post('/google')
  @SkipApiKey()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async googleSignIn(@Body() body: GoogleSignInDto): Promise<SignInResponseDto> {
    const data = await this._authUC.googleSignIn(body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Bienvenid@',
      data: {
        tokens: data.tokens,
        user: data.user,
        accessSessionId: data.session?.accessSessionId,
      },
    };
  }

  /**
   * Vincula una cuenta de Google al usuario autenticado (pantalla Mi perfil).
   * Mismo idToken del sign-in nativo; acá NO crea cuentas ni inicia sesión.
   */
  @Post('/link-google')
  @UseGuards(AuthGuard())
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async linkGoogle(
    @GetUser() user: User,
    @Body() body: GoogleSignInDto,
  ): Promise<MessageResponseDto> {
    await this._authUC.linkGoogle(user.id, body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cuenta de Google vinculada exitosamente',
    };
  }

  /**
   * Desvincula la cuenta de Google del usuario autenticado. El acceso queda
   * solo por correo + contraseña (recuperable con "¿Olvidaste tu contraseña?").
   */
  @Post('/unlink-google')
  @UseGuards(AuthGuard())
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async unlinkGoogle(@GetUser() user: User): Promise<MessageResponseDto> {
    await this._authUC.unlinkGoogle(user.id);
    return {
      statusCode: HttpStatus.OK,
      message: 'Cuenta de Google desvinculada exitosamente',
    };
  }

  @Post('refresh-token')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @RefreshTokenDocs()
  async refreshToken(
    @Body() body: RefreshTokenBodyDto,
  ): Promise<RefreshTokenResponseDto> {
    const data = await this._authUC.refreshToken(body);
    return {
      statusCode: HttpStatus.OK,
      data: {
        tokens: data.tokens,
        user: data.user,
      },
    };
  }

  @Post('/forgot-password')
  @SkipApiKey()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async forgotPassword(
    @Body() body: ForgotPasswordDto,
  ): Promise<MessageResponseDto> {
    await this._authUC.forgotPassword(body);
    return {
      statusCode: HttpStatus.OK,
      message:
        'Te enviamos un código para restablecer tu contraseña. Revisa tu correo.',
    };
  }

  @Post('/reset-password')
  @SkipApiKey()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async resetPassword(
    @Body() body: ResetPasswordDto,
  ): Promise<MessageResponseDto> {
    await this._authUC.resetPassword(body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Contraseña actualizada. Ya puedes iniciar sesión.',
    };
  }

  @Post('/sign-out')
  @UseGuards(AuthGuard())
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @SignOutDocs()
  async signOut(@Body() body: SignOutBodyDto): Promise<SignOutResponseDto> {
    await this._authUC.signOut(body);
    return {
      statusCode: HttpStatus.OK,
      message: 'Sesión cerrada exitosamente',
    };
  }
}
