import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';
import { UserRepository } from '../../shared/repositories/user.repository';
import { RoleTypeRepository } from '../../shared/repositories/roleType.repository';
import { MunicipalityRepository } from '../../shared/repositories/municipality.repository';
import { DepartmentRepository } from '../../shared/repositories/department.repository';
import { IdentificationTypeRepository } from '../../shared/repositories/identificationType.repository';
import { User } from '../../shared/entities/user.entity';
import { NOT_FOUND_MESSAGE } from '../../shared/constants/messages.constant';
import { CreateUserDto, RegisterUserDto, UpdateUserDto } from '../dtos/user.dto';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';
import { MailsService } from '../../shared/services/mails.service';
import { MailTemplateService } from '../../shared/services/mail-template.service';

const SALT_ROUNDS = 12;
const EMAIL_VERIFICATION_TOKEN_MINUTES = 30;

export interface GoogleUserProfile {
  googleId: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
}

@Injectable()
export class UserService {
  constructor(
    private readonly _userRepository: UserRepository,
    private readonly _roleTypeRepository: RoleTypeRepository,
    private readonly _municipalityRepository: MunicipalityRepository,
    private readonly _departmentRepository: DepartmentRepository,
    private readonly _identificationTypeRepository: IdentificationTypeRepository,
    private readonly _configService: ConfigService,
    private readonly _mailsService: MailsService,
    private readonly _mailTemplateService: MailTemplateService,
  ) {}

  async findOne(id: string): Promise<User> {
    const user = await this._userRepository.findOne({
      where: { id },
      relations: ['roleType', 'municipality', 'department'],
    });
    if (!user) {
      throw new HttpException(NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND);
    }
    return user;
  }

  async findByParams(params: Record<string, any>): Promise<User> {
    return await this._userRepository.findOne({ where: params });
  }

  async create(dto: CreateUserDto): Promise<User> {
    await this.assertEmailAvailable(dto.email);
    await this.assertUsernameAvailable(dto.username);
    await this.assertRelationsExist(dto);

    const password = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = this._userRepository.create({ ...dto, password });
    return await this._userRepository.save(user);
  }

  /**
   * Auto-registro con un rol específico (cliente / repartidor). El rol se
   * resuelve por `code` contra la tabla `roleType`. La cuenta queda pendiente
   * de verificación: se envía un correo con un enlace que vence en 30 min y
   * el login se bloquea hasta que se verifique (ver AuthService.signIn).
   */
  async register(dto: RegisterUserDto, roleCode: RoleTypeCode): Promise<User> {
    const email = dto.email.toLowerCase();
    await this.handleExistingRegistration(email);
    await this.assertUsernameAvailable(dto.username);

    const roleType = await this._roleTypeRepository.findOne({
      where: { code: roleCode },
    });
    if (!roleType) {
      throw new BadRequestException(
        `El rol "${roleCode}" no está configurado en la base de datos`,
      );
    }

    await this.assertRelationsExist(dto);

    const password = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = this._userRepository.create({
      ...dto,
      email,
      password,
      roleTypeId: roleType.id,
      isActive: true,
      isEmailVerified: false,
    });
    const saved = await this._userRepository.save(user);

    try {
      await this.sendVerificationEmail(saved);
    } catch (error) {
      console.error('Error sending verification email:', error);
    }

    return saved;
  }

  /**
   * Reglas de samawe para un registro repetido: si el correo ya existe
   * verificado es conflicto; si está pendiente y el token sigue vivo se pide
   * revisar el correo; si el token expiró se reenvía uno nuevo.
   */
  private async handleExistingRegistration(email: string): Promise<void> {
    const existing = await this._userRepository.findOne({ where: { email } });
    if (!existing) return;

    if (existing.isEmailVerified) {
      throw new ConflictException('El correo electrónico ya está en uso');
    }

    const tokenExpired =
      !existing.emailVerificationTokenExpiry ||
      existing.emailVerificationTokenExpiry < new Date();

    if (!tokenExpired) {
      throw new HttpException(
        {
          message:
            'Ya tienes un registro pendiente. Revisa tu correo y verifica tu cuenta.',
          code: 'PENDING_VERIFICATION',
        },
        HttpStatus.CONFLICT,
      );
    }

    await this.sendVerificationEmail(existing);
    throw new HttpException(
      {
        message:
          'Tu enlace de verificación había expirado. Te enviamos uno nuevo, revisa tu correo.',
        code: 'VERIFICATION_RESENT',
      },
      HttpStatus.CONFLICT,
    );
  }

  private async sendVerificationEmail(user: User): Promise<void> {
    const token = await this.generateEmailVerificationToken(user.id);
    const baseUrl =
      this._configService.get<string>('app.baseUrl') || 'http://localhost:3000';
    const verifyLink = `${baseUrl}/user/verify-email?token=${token}&userId=${user.id}`;

    await this._mailsService.sendEmail({
      to: user.email,
      subject: 'Verifica tu correo electrónico',
      body: this._mailTemplateService.verifyEmailTemplate(
        verifyLink,
        user.fullName,
      ),
    });
  }

  async generateEmailVerificationToken(userId: string): Promise<string> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + EMAIL_VERIFICATION_TOKEN_MINUTES);

    await this._userRepository.update(userId, {
      emailVerificationToken: token,
      emailVerificationTokenExpiry: expiry,
    });

    return token;
  }

  async verifyEmail(token: string, userId: string): Promise<void> {
    const user = await this._userRepository.findOne({
      where: { id: userId, emailVerificationToken: token },
    });

    if (!user) {
      throw new BadRequestException(
        'El enlace de verificación no es válido o ya fue utilizado.',
      );
    }

    if (user.emailVerificationTokenExpiry < new Date()) {
      throw new BadRequestException(
        'El enlace de verificación ha expirado. Vuelve a registrarte para recibir uno nuevo.',
      );
    }

    await this._userRepository.update(
      { id: userId },
      {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationTokenExpiry: null,
      },
    );
  }

  /**
   * Autenticación con Google: busca por googleId; si no existe pero el correo
   * ya está registrado, vincula la cuenta (llena googleId, avatar y marca el
   * correo como verificado — Google ya lo verificó). Si no hay cuenta, la crea
   * con el rol indicado (cliente por defecto) y una contraseña aleatoria.
   */
  async findOrCreateGoogleUser(
    profile: GoogleUserProfile,
    roleCode: RoleTypeCode = RoleTypeCode.CLIENT,
  ): Promise<{ user: User; isNewUser: boolean }> {
    let user = await this._userRepository.findOne({
      where: { googleId: profile.googleId },
      relations: ['roleType'],
    });

    if (user) {
      if (profile.avatarUrl && !user.avatarUrl) {
        await this._userRepository.update(
          { id: user.id },
          { avatarUrl: profile.avatarUrl },
        );
        user.avatarUrl = profile.avatarUrl;
      }
      return { user, isNewUser: false };
    }

    const email = profile.email?.toLowerCase();
    if (email) {
      user = await this._userRepository.findOne({
        where: { email },
        relations: ['roleType'],
      });

      if (user) {
        await this._userRepository.update(
          { id: user.id },
          {
            googleId: profile.googleId,
            avatarUrl: profile.avatarUrl || user.avatarUrl,
            isEmailVerified: true,
            emailVerificationToken: null,
            emailVerificationTokenExpiry: null,
          },
        );
        user.googleId = profile.googleId;
        user.avatarUrl = profile.avatarUrl || user.avatarUrl;
        user.isEmailVerified = true;
        return { user, isNewUser: false };
      }
    }

    const roleType = await this._roleTypeRepository.findOne({
      where: { code: roleCode },
    });
    if (!roleType) {
      throw new BadRequestException(
        `El rol "${roleCode}" no está configurado en la base de datos`,
      );
    }

    const randomPassword = await bcrypt.hash(
      crypto.randomBytes(32).toString('hex'),
      SALT_ROUNDS,
    );

    const newUser = this._userRepository.create({
      googleId: profile.googleId,
      email,
      fullName: profile.fullName,
      avatarUrl: profile.avatarUrl,
      password: randomPassword,
      roleTypeId: roleType.id,
      isActive: true,
      isEmailVerified: true,
    });

    const saved = await this._userRepository.save(newUser);
    const withRole = await this._userRepository.findOne({
      where: { id: saved.id },
      relations: ['roleType'],
    });
    return { user: withRole, isNewUser: true };
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (dto.email && dto.email !== user.email) {
      await this.assertEmailAvailable(dto.email);
    }
    if (dto.username && dto.username !== user.username) {
      await this.assertUsernameAvailable(dto.username);
    }
    await this.assertRelationsExist(dto);

    const { password, ...rest } = dto;
    Object.assign(user, rest);
    if (password) {
      user.password = await bcrypt.hash(password, SALT_ROUNDS);
    }

    return await this._userRepository.save(user);
  }

  async delete(id: string): Promise<void> {
    const user = await this.findOne(id);
    await this._userRepository.delete(user.id);
  }

  // ---------- helpers ----------

  private async assertEmailAvailable(email?: string): Promise<void> {
    if (!email) return;
    const exists = await this._userRepository.findOne({ where: { email } });
    if (exists) {
      throw new ConflictException('El email ya está registrado');
    }
  }

  private async assertUsernameAvailable(username?: string): Promise<void> {
    if (!username) return;
    const exists = await this._userRepository.findOne({ where: { username } });
    if (exists) {
      throw new ConflictException('El nombre de usuario ya está en uso');
    }
  }

  private async assertRelationsExist(
    dto: Partial<CreateUserDto>,
  ): Promise<void> {
    if (dto.roleTypeId) {
      const roleType = await this._roleTypeRepository.findOne({
        where: { id: dto.roleTypeId },
      });
      if (!roleType) throw new BadRequestException('Rol no encontrado');
    }

    if (dto.municipalityId) {
      const municipality = await this._municipalityRepository.findOne({
        where: { id: dto.municipalityId },
      });
      if (!municipality)
        throw new NotFoundException('Municipio no encontrado');
    }

    if (dto.departmentId) {
      const department = await this._departmentRepository.findOne({
        where: { id: dto.departmentId },
      });
      if (!department)
        throw new NotFoundException('Departamento no encontrado');
    }

    if (dto.identificationTypeId) {
      const identificationType = await this._identificationTypeRepository.findOne(
        { where: { id: dto.identificationTypeId } },
      );
      if (!identificationType)
        throw new NotFoundException('Tipo de identificación no encontrado');
    }
  }
}
