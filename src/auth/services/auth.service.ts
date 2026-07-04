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
      throw new UnauthorizedException(
        tokenExpired
          ? 'Tu enlace de verificación expiró. Vuelve a registrarte.'
          : 'Debes verificar tu correo electrónico antes de iniciar sesión.',
      );
    }

    return await this.buildSignInResponse(user);
  }

  /**
   * Autenticación con Google. La app manda el idToken que le entrega el
   * Google Sign-In nativo; acá se verifica contra los client ids configurados
   * y se busca/crea/vincula la cuenta (googleId).
   */
  async googleSignIn(body: GoogleSignInDto) {
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
        idToken: body.idToken,
        audience,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('No se pudo autenticar con Google');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('No se pudo autenticar con Google');
    }

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
        ...(isNewUser !== undefined && { isNewUser }),
      },
      session: { accessSessionId },
    };
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

    const tokens = this.generateTokens({
      email: user.email,
      id: user.id,
      sub: user.id,
    });

    return {
      tokens,
      user: { id: user.id, fullName: user.fullName, roleTypeId: user.roleTypeId },
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
