import { GoogleSignInDto, RefreshTokenBodyDto } from '../dtos/auth.dto';
import {
  TokenPayloadModel,
  UserAuthModel,
} from '../models/authentication.model';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../../user/services/user.service';
import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { AccessSessionsService } from './accessSessions.service';
import { v4 as uuidv4 } from 'uuid';
import { UNAUTHORIZED_MESSAGE } from '../../shared/constants/messages.constant';
import { INVALID_ACCESS_DATA_MESSAGE } from '../constants/messages.constants';
import { NOT_FOUND_RESPONSE } from '../../shared/constants/response.constant';
import { User } from '../../shared/entities/user.entity';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';

@Injectable()
export class AuthService {
  private readonly _googleClient = new OAuth2Client();

  constructor(
    private readonly _userService: UserService,
    private readonly _jwtService: JwtService,
    private readonly _configService: ConfigService,
    private readonly _accessSessionsService: AccessSessionsService,
  ) {}

  async signIn(credentials: Partial<UserAuthModel>) {
    const user = await this._userService.findByParams({
      email: credentials.email,
    });

    if (!user) {
      throw new UnauthorizedException(INVALID_ACCESS_DATA_MESSAGE);
    }

    const passwordMatch = await bcrypt.compare(
      credentials.password,
      user.password,
    );
    if (!passwordMatch) {
      throw new UnauthorizedException(INVALID_ACCESS_DATA_MESSAGE);
    }

    this.assertNotBanned(user);

    if (!user.isEmailVerified) {
      const tokenExpired =
        !user.emailVerificationTokenExpiry ||
        user.emailVerificationTokenExpiry < new Date();
      // El `code` le dice al front que muestre el botón de reenviar.
      throw new UnauthorizedException({
        message: tokenExpired
          ? 'Tu enlace de verificación expiró. Reenvíalo para recibir uno nuevo.'
          : 'Debes verificar tu correo electrónico antes de iniciar sesión.',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    return await this.buildSignInResponse(user);
  }

  /**
   * Autenticación con Google. La app manda el idToken que le entrega el
   * Google Sign-In nativo; acá se verifica contra los client ids configurados
   * y se busca/crea/vincula la cuenta (googleId).
   */
  async googleSignIn(body: GoogleSignInDto) {
    const payload = await this.verifyGoogleIdToken(body.idToken);

    const roleCode =
      body.role === 'delivery' ? RoleTypeCode.DELIVERY : RoleTypeCode.CLIENT;

    const { user, isNewUser } = await this._userService.findOrCreateGoogleUser(
      {
        googleId: payload.sub,
        email: payload.email,
        fullName: payload.name || payload.email.split('@')[0],
        avatarUrl: payload.picture,
      },
      roleCode,
    );

    this.assertNotBanned(user);

    return await this.buildSignInResponse(user, isNewUser);
  }

  /**
   * Vincula una cuenta de Google al usuario YA autenticado (botón "Vincular
   * con Google" de la pantalla Mi perfil). Verifica el idToken igual que el
   * sign-in y delega la vinculación en UserService.
   */
  async linkGoogle(userId: string, idToken: string): Promise<void> {
    const payload = await this.verifyGoogleIdToken(idToken);
    await this._userService.linkGoogleAccount(userId, {
      googleId: payload.sub,
      email: payload.email,
      fullName: payload.name || payload.email.split('@')[0],
      avatarUrl: payload.picture,
    });
  }

  /** Quita el vínculo con Google (queda el acceso por correo + contraseña). */
  async unlinkGoogle(userId: string): Promise<void> {
    await this._userService.unlinkGoogleAccount(userId);
  }

  /** Verifica un idToken de Google contra los client ids configurados. */
  private async verifyGoogleIdToken(idToken: string) {
    const audience = [
      this._configService.get<string>('google.webClientId'),
      this._configService.get<string>('google.androidClientId'),
    ].filter(Boolean);

    if (!audience.length) {
      throw new UnauthorizedException(
        'La autenticación con Google no está configurada en el servidor',
      );
    }

    let payload;
    try {
      const ticket = await this._googleClient.verifyIdToken({
        idToken,
        audience,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('No se pudo autenticar con Google');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('No se pudo autenticar con Google');
    }

    return payload;
  }

  /** Recuperación de contraseña (la lógica vive en UserService). */
  async forgotPassword(email: string): Promise<void> {
    await this._userService.forgotPassword(email);
  }

  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    await this._userService.resetPassword(email, code, newPassword);
  }

  private assertNotBanned(user: User): void {
    if (user.isBanned) {
      throw new UnauthorizedException(
        'Tu cuenta ha sido suspendida. Contacta al administrador.',
      );
    }
  }

  private async buildSignInResponse(user: User, isNewUser?: boolean) {
    const payload = { email: user.email, sub: user.id, id: user.id };
    const tokens = this.generateTokens(payload);

    const accessSessionId = await this._accessSessionsService.generateSession({
      userId: user.id,
      accessToken: tokens.accessToken,
      id: uuidv4(),
    });

    return {
      tokens,
      user: {
        id: user.id,
        fullName: user.fullName,
        roleTypeId: user.roleTypeId,
        role: this.toRolePayload(user),
        avatarUrl: user.avatarUrl ?? null,
        // El front decide con esto si un DELI entra al panel o a la pantalla
        // "Cuenta en proceso de habilitación" (+ la nota del admin).
        isActive: user.isActive,
        observations: user.observations ?? null,
        // null = nunca aceptó Términos/Tratamiento de Datos → el front lo lleva
        // al gate de aceptación antes de entrar a la app (§41).
        termsAcceptedAt: user.termsAcceptedAt ?? null,
        ...(isNewUser !== undefined && { isNewUser }),
      },
      session: { accessSessionId },
    };
  }

  /** Rol plano para el front (el `code` decide la navegación, ej. ADMIN). */
  private toRolePayload(user: User) {
    return user.roleType
      ? {
          id: user.roleType.id,
          code: user.roleType.code,
          name: user.roleType.name,
        }
      : null;
  }

  async validateSession({ userId, token }: { userId: string; token: string }) {
    const user = await this._userService.findOne(userId);

    try {
      this._jwtService.verify(token, {
        secret: this._configService.get<string>('jwt.secret'),
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e) {
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    }

    if (!user) {
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    }

    return user;
  }

  generateTokens(payload: TokenPayloadModel): {
    accessToken: string;
    refreshToken: string;
  } {
    const secret = this._configService.get<string>('jwt.secret');

    const accessToken = this._jwtService.sign(payload, {
      expiresIn: this._configService.get('jwt.expiresIn'),
      secret,
    });

    const refreshToken = this._jwtService.sign(payload, {
      expiresIn: this._configService.get('jwt.refreshTokenExpiresIn'),
      secret,
    });

    return { accessToken, refreshToken };
  }

  async refreshToken(body: RefreshTokenBodyDto) {
    let payload;
    try {
      payload = this._jwtService.verify(body.refreshToken, {
        secret: this._configService.get<string>('jwt.secret'),
      });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e) {
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    }

    const user = await this._userService.findOne(payload.sub);
    if (!user) {
      throw new UnauthorizedException(UNAUTHORIZED_MESSAGE);
    }

    this.assertNotBanned(user);

    const tokens = this.generateTokens({
      email: user.email,
      id: user.id,
      sub: user.id,
    });

    return {
      tokens,
      user: {
        id: user.id,
        fullName: user.fullName,
        roleTypeId: user.roleTypeId,
        role: this.toRolePayload(user),
        avatarUrl: user.avatarUrl ?? null,
        // Igual que el sign-in: el auto-login refresca el estado de
        // habilitación del repartidor (y la nota del admin) al abrir la app.
        isActive: user.isActive,
        observations: user.observations ?? null,
        termsAcceptedAt: user.termsAcceptedAt ?? null,
      },
    };
  }

  async signOut({
    userId,
    accessToken,
    accessSessionId,
  }: {
    userId: string;
    accessToken: string;
    accessSessionId: string;
  }): Promise<void> {
    const session = await this._accessSessionsService.findOneByParams({
      userId,
      accessToken,
      id: accessSessionId,
    });

    if (!session) {
      throw new NotFoundException(NOT_FOUND_RESPONSE);
    }

    await this._accessSessionsService.delete(session.id, userId);
  }
}
