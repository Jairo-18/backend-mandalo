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
import { LocalStorageService } from '../../localStorage/services/localStorage.service';
import { UserAddressRepository } from '../../shared/repositories/userAddress.repository';

const SALT_ROUNDS = 12;
const EMAIL_VERIFICATION_TOKEN_MINUTES = 30;
const PASSWORD_RESET_CODE_MINUTES = 15;

export interface GoogleUserProfile {
  googleId: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
}

/** Fotos de verificación del registro de repartidor (multipart). */
export interface RegisterDeliveryFiles {
  avatar?: Express.Multer.File[];
  idFront?: Express.Multer.File[];
  idBack?: Express.Multer.File[];
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
    private readonly _localStorageService: LocalStorageService,
    private readonly _userAddressRepository: UserAddressRepository,
  ) {}

  async findOne(id: string): Promise<User> {
    const user = await this._userRepository.findOne({
      where: { id },
      relations: ['roleType', 'municipality', 'department', 'identificationType'],
    });
    if (!user) {
      throw new HttpException(NOT_FOUND_MESSAGE, HttpStatus.NOT_FOUND);
    }
    return user;
  }

  async findByParams(params: Record<string, any>): Promise<User> {
    return await this._userRepository.findOne({
      where: params,
      relations: ['roleType'],
    });
  }

  async create(dto: CreateUserDto): Promise<User> {
    const { roleTypeCode, ...data } = dto;
    await this.assertEmailAvailable(data.email);
    await this.assertUsernameAvailable(data.username);
    await this.assertPhoneAvailable(data.phone);
    await this.assertIdentificationAvailable(data.identificationNumber);
    await this.assertRelationsExist(data);

    // El rol puede venir por uuid (roleTypeId) o por code (roleTypeCode);
    // el code manda si vienen los dos.
    let roleTypeId = data.roleTypeId;
    if (roleTypeCode) {
      const roleType = await this._roleTypeRepository.findOne({
        where: { code: roleTypeCode },
      });
      if (!roleType) {
        throw new BadRequestException(
          `El rol "${roleTypeCode}" no está configurado en la base de datos`,
        );
      }
      roleTypeId = roleType.id;
    }

    const password = await bcrypt.hash(dto.password, SALT_ROUNDS);
    // Cuenta creada por un administrador: no se envía correo de verificación,
    // así que nace verificada (si no, nunca podría iniciar sesión).
    const user = this._userRepository.create({
      ...data,
      roleTypeId,
      password,
      isEmailVerified: true,
    });
    return await this._userRepository.save(user);
  }

  /**
   * Auto-registro con un rol específico (cliente / repartidor). El rol se
   * resuelve por `code` contra la tabla `roleType`. La cuenta queda pendiente
   * de verificación: se envía un correo con un enlace que vence en 30 min y
   * el login se bloquea hasta que se verifique (ver AuthService.signIn).
   */
  async register(
    dto: RegisterUserDto,
    roleCode: RoleTypeCode,
    files?: RegisterDeliveryFiles,
  ): Promise<User> {
    const email = dto.email.toLowerCase();
    const isDelivery = roleCode === RoleTypeCode.DELIVERY;

    // Los repartidores suben sí o sí su foto y el documento por ambos lados
    // (un admin los revisa antes de activar la cuenta). Se valida ANTES de
    // crear el usuario para no dejar cuentas a medias.
    if (isDelivery) {
      if (!files?.avatar?.[0]) {
        throw new BadRequestException('La foto de tu rostro es obligatoria');
      }
      if (!files?.idFront?.[0] || !files?.idBack?.[0]) {
        throw new BadRequestException(
          'Las fotos de tu documento (por delante y por detrás) son obligatorias',
        );
      }
    }

    await this.handleExistingRegistration(email);
    await this.assertUsernameAvailable(dto.username);
    await this.assertPhoneAvailable(dto.phone);
    await this.assertIdentificationAvailable(dto.identificationNumber);

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
      // La cuenta DELI nace inactiva: la habilita un admin tras revisar los
      // documentos (la pantalla "Cuenta en proceso de habilitación" del front).
      isActive: !isDelivery,
      isEmailVerified: false,
    });
    const saved = await this._userRepository.save(user);

    // Fotos de verificación del repartidor (después de crear: si el registro
    // falla por duplicados no quedan archivos huérfanos en el disco).
    if (isDelivery && files) {
      const [avatar, idFront, idBack] = await Promise.all([
        this._localStorageService.saveImage(files.avatar![0], 'users'),
        this._localStorageService.saveImage(files.idFront![0], 'users'),
        this._localStorageService.saveImage(files.idBack![0], 'users'),
      ]);
      await this._userRepository.update(saved.id, {
        avatarUrl: avatar.imageUrl,
        identificationFrontUrl: idFront.imageUrl,
        identificationBackUrl: idBack.imageUrl,
      });
      saved.avatarUrl = avatar.imageUrl;
      saved.identificationFrontUrl = idFront.imageUrl;
      saved.identificationBackUrl = idBack.imageUrl;
    }

    // Un cliente nuevo arranca con su dirección del registro como principal
    // en userAddress ("Casa", con coordenadas si usó el GPS). Espejo del seed
    // de la migración AddUserAddress; solo aplica al rol USER.
    if (roleCode === RoleTypeCode.CLIENT && dto.address?.trim()) {
      await this._userAddressRepository.save(
        this._userAddressRepository.create({
          userId: saved.id,
          label: 'Casa',
          address: dto.address.trim(),
          latitude: dto.latitude,
          longitude: dto.longitude,
          isDefault: true,
        }),
      );
    }

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

    try {
      await this.sendVerificationEmail(existing);
    } catch (error) {
      // Sin esto, una caída del SMTP convierte el reenvío en un 500 genérico.
      console.error('Error resending verification email:', error);
      throw new HttpException(
        {
          message:
            'No pudimos enviar el correo de verificación. Inténtalo de nuevo en unos minutos.',
          code: 'VERIFICATION_EMAIL_FAILED',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
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
   * Recuperación de contraseña, paso 1: genera un código de 6 dígitos que
   * vence en 15 min y lo envía por correo. El usuario lo digita en la app
   * (no hay enlaces ni deep links).
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this._userRepository.findOne({
      where: { email: email.toLowerCase() },
    });
    if (!user) {
      throw new NotFoundException('No encontramos una cuenta con ese correo.');
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + PASSWORD_RESET_CODE_MINUTES);
    await this._userRepository.update(user.id, {
      resetToken: code,
      resetTokenExpiry: expiry,
    });

    try {
      await this._mailsService.sendEmail({
        to: user.email,
        subject: 'Código para restablecer tu contraseña',
        body: this._mailTemplateService.resetPasswordTemplate(
          code,
          user.fullName,
        ),
      });
    } catch (error) {
      console.error('Error sending password reset email:', error);
      throw new HttpException(
        {
          message:
            'No pudimos enviar el correo. Inténtalo de nuevo en unos minutos.',
          code: 'RESET_EMAIL_FAILED',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Recuperación de contraseña, paso 2: valida el código y cambia la
   * contraseña. Usar el código recibido por correo también prueba que el
   * correo es del usuario, así que de paso la cuenta queda verificada.
   */
  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this._userRepository.findOne({
      where: { email: email.toLowerCase() },
    });

    if (!user || !user.resetToken || user.resetToken !== code) {
      throw new BadRequestException('El código no es válido.');
    }
    if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
      throw new BadRequestException('El código expiró. Solicita uno nuevo.');
    }

    const password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this._userRepository.update(
      { id: user.id },
      {
        password,
        resetToken: null,
        resetTokenExpiry: null,
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
      // Un repartidor creado vía Google también espera activación del admin
      // (además le faltan las fotos del documento: las pedirá el panel DELI).
      isActive: roleCode !== RoleTypeCode.DELIVERY,
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
    if (dto.phone && dto.phone !== user.phone) {
      await this.assertPhoneAvailable(dto.phone);
    }
    if (
      dto.identificationNumber &&
      dto.identificationNumber !== user.identificationNumber
    ) {
      await this.assertIdentificationAvailable(dto.identificationNumber);
    }
    await this.assertRelationsExist(dto);

    const { password, roleTypeCode, ...rest } = dto;

    if (roleTypeCode) {
      const roleType = await this._roleTypeRepository.findOne({
        where: { code: roleTypeCode },
      });
      if (!roleType) {
        throw new BadRequestException(
          `El rol "${roleTypeCode}" no está configurado en la base de datos`,
        );
      }
      rest.roleTypeId = roleType.id;
    }
    if (rest.roleTypeId && rest.roleTypeId !== user.roleTypeId) {
      // findOne carga la relación; se limpia para que no pise el id nuevo.
      user.roleType = undefined;
    }

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

  /**
   * Sube/reemplaza la foto de perfil: guarda la nueva imagen, actualiza
   * `avatarUrl` y borra el archivo anterior del disco (solo si era una
   * imagen subida a este servidor; los avatares de Google no se tocan).
   */
  async updateAvatar(
    id: string,
    file: Express.Multer.File,
  ): Promise<{ avatarUrl: string }> {
    const user = await this.findOne(id);

    const { imageUrl } = await this._localStorageService.saveImage(
      file,
      'users',
    );

    const oldPublicId = this._localStorageService.publicIdFromUrl(
      user.avatarUrl,
    );
    await this._userRepository.update(id, { avatarUrl: imageUrl });
    if (oldPublicId) {
      await this._localStorageService.deleteImage(oldPublicId);
    }

    return { avatarUrl: imageUrl };
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

  private async assertPhoneAvailable(phone?: string | null): Promise<void> {
    if (!phone) return;
    const exists = await this._userRepository.findOne({ where: { phone } });
    if (exists) {
      throw new ConflictException('El teléfono ya está registrado');
    }
  }

  private async assertIdentificationAvailable(
    identificationNumber?: string | null,
  ): Promise<void> {
    if (!identificationNumber) return;
    const exists = await this._userRepository.findOne({
      where: { identificationNumber },
    });
    if (exists) {
      throw new ConflictException(
        'El número de identificación ya está registrado',
      );
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
