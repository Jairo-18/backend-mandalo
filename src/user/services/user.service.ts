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
import {
  BecomeDeliveryDto,
  BulkInviteUsersDto,
  BusinessLeadDto,
  CreateUserDto,
  RegisterUserDto,
  ResendDeliveryDocumentsDto,
  UpdateUserDto,
} from '../dtos/user.dto';
import { RoleTypeCode } from '../../shared/roles/roleTypeCode.enum';
import { MailsService } from '../../shared/services/mails.service';
import {
  bannerAttachment,
  MailTemplateService,
} from '../../shared/services/mail-template.service';
import { LocalStorageService } from '../../localStorage/services/localStorage.service';
import { CURRENT_TERMS_VERSION } from '../../shared/constants/terms.constant';
import { UserAddressRepository } from '../../shared/repositories/userAddress.repository';
import { InvoiceRepository } from '../../shared/repositories/invoice.repository';
import { OrganizationalRepository } from '../../shared/repositories/organizational.repository';

const SALT_ROUNDS = 12;
const EMAIL_VERIFICATION_TOKEN_MINUTES = 30;
const PASSWORD_RESET_CODE_MINUTES = 15;
const DELETION_TOKEN_MINUTES = 30;
const BUSINESS_CONTACT_EMAIL = 'mandaloputumayo@gmail.com';

/**
 * Contraseña fija por rol para la alta masiva del admin (`bulkInvite`,
 * pedido explícito del cliente — no aleatoria, para que sea fácil de
 * comunicar). El correo de bienvenida recomienda cambiarla de inmediato.
 * Exportada: el endpoint de preview del correo (`UserController`) la reusa
 * para no duplicar los 3 valores.
 */
export const BULK_INVITE_PASSWORDS: Partial<Record<RoleTypeCode, string>> = {
  [RoleTypeCode.CLIENT]: 'MandaloCliente',
  [RoleTypeCode.BUSINESS]: 'MandaloNegocio',
  [RoleTypeCode.DELIVERY]: 'MandaloDomiciliario',
};

const BULK_INVITE_ROLE_LABELS: Partial<Record<RoleTypeCode, string>> = {
  [RoleTypeCode.CLIENT]: 'Cliente',
  [RoleTypeCode.BUSINESS]: 'Negocio',
  [RoleTypeCode.DELIVERY]: 'Domiciliario',
};

export interface GoogleUserProfile {
  googleId: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
}

export interface BulkInviteResult {
  created: string[];
  skippedExisting: string[];
  failed: string[];
}

/** Fotos/documentos de verificación del registro de repartidor (multipart). */
export interface RegisterDeliveryFiles {
  avatar?: Express.Multer.File[];
  idFront?: Express.Multer.File[];
  idBack?: Express.Multer.File[];
  // Licencia de conducción: foto por delante y por detrás (misma lógica que
  // la cédula). SOAT / tecnomecánica: un solo archivo cada uno, foto o pdf.
  licenseFront?: Express.Multer.File[];
  licenseBack?: Express.Multer.File[];
  soat?: Express.Multer.File[];
  technicalInspection?: Express.Multer.File[];
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
    private readonly _invoiceRepository: InvoiceRepository,
    private readonly _organizationalRepository: OrganizationalRepository,
  ) {}

  /**
   * Registra la aceptación de Términos y Condiciones + Tratamiento de Datos del
   * usuario autenticado (gate de inicio de sesión). Si el usuario es dueño de
   * uno o más negocios, se marca también la aceptación del negocio con el mismo
   * acto (los dos aceptan a la vez, ver §41).
   */
  async acceptTerms(userId: string): Promise<void> {
    const now = new Date();
    await this._userRepository.update(userId, {
      termsAcceptedAt: now,
      termsVersion: CURRENT_TERMS_VERSION,
    });
    await this._organizationalRepository.update(
      { legalPersonId: userId },
      { termsAcceptedAt: now, termsVersion: CURRENT_TERMS_VERSION },
    );
  }

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
   * Alta masiva de cuentas (panel admin → "Alta masiva"): sube un CSV/lista
   * de correos con un rol fijo (Cliente/Negocio/Domiciliario), crea una
   * cuenta por cada correo NUEVO con la contraseña fija de ese rol
   * (`BULK_INVITE_PASSWORDS`) y le manda un correo de bienvenida individual
   * (nunca varios destinatarios en un mismo correo, para que nadie vea la
   * contraseña de los demás). Los correos que ya tienen cuenta se omiten sin
   * tocarlos; si falla la creación o el envío de uno, sigue con el resto.
   */
  async bulkInvite(dto: BulkInviteUsersDto): Promise<BulkInviteResult> {
    const password = BULK_INVITE_PASSWORDS[dto.roleTypeCode];
    const roleLabel = BULK_INVITE_ROLE_LABELS[dto.roleTypeCode];
    if (!password || !roleLabel) {
      throw new BadRequestException(
        `El rol "${dto.roleTypeCode}" no admite alta masiva`,
      );
    }

    const uniqueEmails = [
      ...new Set(dto.emails.map((email) => email.trim().toLowerCase())),
    ];

    const created: string[] = [];
    const skippedExisting: string[] = [];
    const failed: string[] = [];

    for (const email of uniqueEmails) {
      let fullName: string;
      try {
        const exists = await this._userRepository.findOne({
          where: { email },
        });
        if (exists) {
          skippedExisting.push(email);
          continue;
        }

        fullName = this.fullNameFromEmail(email);
        await this.create({
          fullName,
          email,
          password,
          roleTypeCode: dto.roleTypeCode,
        });
        created.push(email);
      } catch {
        // No se pudo crear la cuenta (p. ej. choque de identificación/
        // teléfono, que aquí nunca se envían, así que en la práctica no
        // debería pasar): se cuenta como fallida y se sigue con el resto.
        failed.push(email);
        continue;
      }

      try {
        const body = await this._mailTemplateService.bulkInviteWelcomeTemplate(
          fullName,
          email,
          password,
          dto.roleTypeCode,
        );
        await this._mailsService.sendEmail({
          to: email,
          subject: `¡Tu cuenta de ${roleLabel} en Mandalo ya está lista!`,
          body,
          attachments: [bannerAttachment()],
        });
      } catch {
        // La cuenta SÍ quedó creada — solo falló el envío del correo. No se
        // marca como fallida (ya está en `created`); si hace falta, el admin
        // puede reenviar las credenciales a mano.
      }
    }

    return { created, skippedExisting, failed };
  }

  /** "juan.perez+test@gmail.com" → "Juan Perez" (nombre provisional cuando la
   * alta masiva solo trae el correo; el usuario lo puede corregir después). */
  private fullNameFromEmail(email: string): string {
    const localPart = email.split('@')[0] ?? email;
    const words = localPart
      .split(/[._+-]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1));
    return words.length ? words.join(' ') : localPart;
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
      if (!dto.vehiclePlate?.trim()) {
        throw new BadRequestException(
          'La placa de tu vehículo es obligatoria',
        );
      }
      if (!files?.licenseFront?.[0] || !files?.licenseBack?.[0]) {
        throw new BadRequestException(
          'Las fotos de tu licencia de conducción (por delante y por detrás) son obligatorias',
        );
      }
      if (!files?.soat?.[0]) {
        throw new BadRequestException(
          'El SOAT es obligatorio (foto o PDF)',
        );
      }
      if (!files?.technicalInspection?.[0]) {
        throw new BadRequestException(
          'La tecnomecánica es obligatoria (foto o PDF)',
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
    const { acceptedTerms: _acceptedTerms, details, ...registerData } = dto;
    const user = this._userRepository.create({
      ...registerData,
      email,
      password,
      roleTypeId: roleType.id,
      // La cuenta DELI nace inactiva: la habilita un admin tras revisar los
      // documentos (la pantalla "Cuenta en proceso de habilitación" del front).
      isActive: !isDelivery,
      isEmailVerified: false,
      // El DTO ya exige acceptedTerms === true (class-validator); se guarda
      // cuándo y qué versión aceptó.
      termsAcceptedAt: new Date(),
      termsVersion: CURRENT_TERMS_VERSION,
    });
    const saved = await this._userRepository.save(user);

    // Fotos/documentos de verificación del repartidor (después de crear: si
    // el registro falla por duplicados no quedan archivos huérfanos en disco).
    if (isDelivery && files) {
      const [avatar, idFront, idBack, licenseFront, licenseBack, soat, technicalInspection] =
        await this.saveAllOrCleanup([
          this._localStorageService.saveImage(files.avatar![0], 'users'),
          this._localStorageService.saveImage(files.idFront![0], 'users'),
          this._localStorageService.saveImage(files.idBack![0], 'users'),
          this._localStorageService.saveImage(files.licenseFront![0], 'users'),
          this._localStorageService.saveImage(files.licenseBack![0], 'users'),
          this._localStorageService.saveDocument(files.soat![0], 'users'),
          this._localStorageService.saveDocument(
            files.technicalInspection![0],
            'users',
          ),
        ]);
      const vehiclePlate = dto.vehiclePlate!.trim().toUpperCase();
      await this._userRepository.update(saved.id, {
        avatarUrl: avatar.imageUrl,
        identificationFrontUrl: idFront.imageUrl,
        identificationBackUrl: idBack.imageUrl,
        vehiclePlate,
        licenseFrontUrl: licenseFront.imageUrl,
        licenseBackUrl: licenseBack.imageUrl,
        soatUrl: soat.imageUrl,
        technicalInspectionUrl: technicalInspection.imageUrl,
      });
      saved.avatarUrl = avatar.imageUrl;
      saved.identificationFrontUrl = idFront.imageUrl;
      saved.identificationBackUrl = idBack.imageUrl;
      saved.vehiclePlate = vehiclePlate;
      saved.licenseFrontUrl = licenseFront.imageUrl;
      saved.licenseBackUrl = licenseBack.imageUrl;
      saved.soatUrl = soat.imageUrl;
      saved.technicalInspectionUrl = technicalInspection.imageUrl;
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
          details: details?.trim() || undefined,
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
   * Registro RÁPIDO de cliente (modo invitado, checkout, §44): crea la cuenta
   * USER **ya verificada** (sin el paso de correo, para que pueda pedir de
   * una) con sus términos aceptados y su dirección principal. Devuelve el
   * usuario con `roleType` cargado para que AuthService arme el auto-login.
   * La verificación de correo queda para después (la cuenta ya es usable).
   */
  async registerQuickClient(dto: RegisterUserDto): Promise<User> {
    const email = dto.email.toLowerCase();
    await this.assertEmailAvailable(email);
    await this.assertUsernameAvailable(dto.username);
    await this.assertPhoneAvailable(dto.phone);
    await this.assertIdentificationAvailable(dto.identificationNumber);
    await this.assertRelationsExist(dto);

    const roleType = await this._roleTypeRepository.findOne({
      where: { code: RoleTypeCode.CLIENT },
    });
    if (!roleType) {
      throw new BadRequestException(
        `El rol "${RoleTypeCode.CLIENT}" no está configurado en la base de datos`,
      );
    }

    const password = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const { acceptedTerms: _acceptedTerms, details, ...registerData } = dto;
    const user = this._userRepository.create({
      ...registerData,
      email,
      password,
      roleTypeId: roleType.id,
      isActive: true,
      // Cuenta usable al instante: sin el gate de verificación de correo.
      isEmailVerified: true,
      termsAcceptedAt: new Date(),
      termsVersion: CURRENT_TERMS_VERSION,
    });
    const saved = await this._userRepository.save(user);

    // Dirección principal ("Casa"), igual que en el registro normal de cliente.
    if (dto.address?.trim()) {
      await this._userAddressRepository.save(
        this._userAddressRepository.create({
          userId: saved.id,
          label: 'Casa',
          address: dto.address.trim(),
          details: details?.trim() || undefined,
          latitude: dto.latitude,
          longitude: dto.longitude,
          isDefault: true,
        }),
      );
    }

    // Con roleType cargado para el toRolePayload del auto-login.
    return this._userRepository.findOne({
      where: { id: saved.id },
      relations: ['roleType'],
    });
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

  /**
   * Reenvía el correo de verificación (botón del login cuando el sign-in
   * rechaza por correo sin verificar).
   */
  async resendVerification(email: string): Promise<void> {
    const user = await this._userRepository.findOne({
      where: { email: email.toLowerCase() },
    });
    if (!user) {
      throw new HttpException(
        'No encontramos una cuenta con ese correo',
        HttpStatus.NOT_FOUND,
      );
    }
    if (user.isEmailVerified) {
      throw new BadRequestException(
        'Este correo ya está verificado. Inicia sesión.',
      );
    }
    try {
      await this.sendVerificationEmail(user);
    } catch (error) {
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
  }

  private async sendVerificationEmail(user: User): Promise<void> {
    const token = await this.generateEmailVerificationToken(user.id);
    const baseUrl =
      this._configService.get<string>('app.baseUrl') || 'http://localhost:3000';
    const verifyLink = `${baseUrl}/user/verify-email?token=${token}&userId=${user.id}`;

    const body = await this._mailTemplateService.verifyEmailTemplate(
      verifyLink,
      user.fullName,
    );
    await this._mailsService.sendEmail({
      to: user.email,
      subject: 'Verifica tu correo electrónico',
      body,
      attachments: [bannerAttachment()],
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
      const body = await this._mailTemplateService.resetPasswordTemplate(
        code,
        user.fullName,
      );
      await this._mailsService.sendEmail({
        to: user.email,
        subject: 'Código para restablecer tu contraseña',
        body,
        attachments: [bannerAttachment()],
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
            // El avatar de Google solo entra si el usuario no tiene foto propia
            // (si no, se pisa la URL local sin borrar el archivo: queda huérfano).
            avatarUrl: user.avatarUrl || profile.avatarUrl,
            isEmailVerified: true,
            emailVerificationToken: null,
            emailVerificationTokenExpiry: null,
          },
        );
        user.googleId = profile.googleId;
        user.avatarUrl = user.avatarUrl || profile.avatarUrl;
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

    // avatarUrl se ignora acá: solo lo toca updateAvatar() (limpia el archivo viejo).
    const { password, roleTypeCode, acceptedTerms, avatarUrl: _a, ...rest } = dto;

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
    if (rest.municipalityId && rest.municipalityId !== user.municipalityId) {
      user.municipality = undefined;
    }
    if (rest.departmentId && rest.departmentId !== user.departmentId) {
      user.department = undefined;
    }
    if (
      rest.identificationTypeId &&
      rest.identificationTypeId !== user.identificationTypeId
    ) {
      user.identificationType = undefined;
    }

    Object.assign(user, rest);
    if (password) {
      user.password = await bcrypt.hash(password, SALT_ROUNDS);
    }
    // Onboarding post-Google (cliente): la 1ª vez que confirma el checkbox
    // de Términos/Tratamiento de Datos desde "Mi perfil" (updateMyProfile).
    // No se "des-acepta": un `false`/ausente simplemente no toca lo guardado.
    if (acceptedTerms) {
      user.termsAcceptedAt = new Date();
      user.termsVersion = CURRENT_TERMS_VERSION;
    }

    return await this._userRepository.save(user);
  }

  /**
   * Eliminar es DESTRUCTIVO: `invoice.userId` es CASCADE, así que borrar una
   * cuenta con pedidos borraría su historial (facturas). Si tiene pedidos
   * (como cliente o como repartidor) se bloquea con 409 — el camino correcto
   * es desactivar o banear la cuenta.
   */
  async delete(id: string): Promise<void> {
    const user = await this.findOne(id);
    const orders = await this._invoiceRepository.count({
      where: [{ userId: user.id }, { deliveryUserId: user.id }],
    });
    if (orders > 0) {
      throw new ConflictException(
        'Esta cuenta tiene pedidos en el historial y no se puede eliminar. Desactívala o banéala en su lugar.',
      );
    }
    await this.deleteUserFiles(user);
    await this._userRepository.delete(user.id);
  }

  /**
   * Borra del disco TODOS los archivos subidos de un usuario (avatar +
   * documentos de repartidor: cédula, licencia, SOAT, tecnomecánica) — se
   * llama antes de eliminar o anonimizar la cuenta, para no dejar basura
   * huérfana en el VPS (el puntero en la DB desaparece de todos modos, así
   * que si no se borra ACÁ ya no queda forma de encontrar el archivo después).
   */
  private async deleteUserFiles(user: User): Promise<void> {
    const urls = [
      user.avatarUrl,
      user.identificationFrontUrl,
      user.identificationBackUrl,
      user.licenseFrontUrl,
      user.licenseBackUrl,
      user.soatUrl,
      user.technicalInspectionUrl,
    ];
    for (const url of urls) {
      const publicId = this._localStorageService.publicIdFromUrl(url);
      if (publicId) await this._localStorageService.deleteImage(publicId);
    }
  }

  /**
   * Sube varios archivos en paralelo (registro/onboarding DELI: son 5-7
   * fotos/documentos). Si alguno falla a mitad de camino, los que sí se
   * alcanzaron a guardar quedarían huérfanos en disco (nunca se les asigna
   * URL en la DB) — acá se detecta con `allSettled` y se borran antes de
   * relanzar el error original.
   */
  private async saveAllOrCleanup(
    tasks: Promise<{ imageUrl: string; publicId: string }>[],
  ): Promise<{ imageUrl: string; publicId: string }[]> {
    const results = await Promise.allSettled(tasks);
    const rejected = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    if (rejected) {
      const fulfilled = results.filter(
        (r): r is PromiseFulfilledResult<{ imageUrl: string; publicId: string }> =>
          r.status === 'fulfilled',
      );
      for (const r of fulfilled) {
        await this._localStorageService.deleteImage(r.value.publicId);
      }
      throw rejected.reason;
    }
    return results.map(
      (r) => (r as PromiseFulfilledResult<{ imageUrl: string; publicId: string }>).value,
    );
  }

  /**
   * Núcleo compartido de "eliminar mi cuenta" (exigido por Google Play, ver
   * NOTAS.md §47): lo usan tanto el self-service logueado
   * (`requestSelfDeletion`) como la confirmación por correo SIN sesión
   * (`confirmDeletionByToken`, punto 1b, §49).
   * - Sin historial (nunca pidió/entregó y no tiene un negocio propio) →
   *   borrado físico inmediato, mismo camino que el admin.
   * - Con historial → la FILA no se borra (perdería facturas/mensajes de
   *   OTROS usuarios: `invoice.userId` es CASCADE), pero sus DATOS
   *   PERSONALES sí se borran de inmediato (anonimización): nombre, correo,
   *   teléfono, dirección/coordenadas, foto de perfil, número de
   *   identificación y — si es repartidor — las fotos de cédula, licencia,
   *   SOAT y tecnomecánica. Lo único que queda es el `id` (esqueleto), para
   *   que pedidos/chats/liquidaciones de otras personas sigan teniendo a
   *   quién apuntar sin romperse. Además se banea (bloquea el login y, por
   *   `AuthService.validateSession`, también las sesiones ya abiertas). Si
   *   es dueño de un negocio (NEGO), ese negocio se desactiva de una vez.
   */
  private async performAccountDeletion(
    user: User,
  ): Promise<{ hardDeleted: boolean }> {
    const orders = await this._invoiceRepository.count({
      where: [{ userId: user.id }, { deliveryUserId: user.id }],
    });
    const businesses = await this._organizationalRepository.count({
      where: { legalPersonId: user.id },
    });

    // Limpia SIEMPRE los archivos del disco antes de eliminar/anonimizar —
    // ninguna de las dos ramas de abajo debe dejar basura huérfana en el VPS.
    await this.deleteUserFiles(user);

    if (orders === 0 && businesses === 0) {
      await this._userRepository.delete(user.id);
      return { hardDeleted: true };
    }

    user.isBanned = true;
    user.deletionRequestedAt = new Date();
    // Un solo uso: si venía de un enlace de correo (confirmDeletionByToken),
    // el token queda inutilizado de una vez.
    user.deletionRequestToken = null;
    user.deletionRequestTokenExpiry = null;

    // Anonimización inmediata: solo queda el `id` (por las FK de otros) y lo
    // que hace falta para que la cuenta quede inutilizable (isBanned) y con
    // rastro de auditoría (deletionRequestedAt). Nada de esto es reversible.
    user.fullName = 'Usuario eliminado';
    user.username = null;
    user.email = `eliminado-${user.id}@mandalo.invalid`;
    // Contraseña inutilizable: aunque isBanned ya bloquea el login, no tiene
    // sentido dejar viva una contraseña que funcionaba.
    user.password = await bcrypt.hash(
      crypto.randomBytes(32).toString('hex'),
      SALT_ROUNDS,
    );
    user.phone = null;
    user.address = null;
    user.latitude = null;
    user.longitude = null;
    user.avatarUrl = null;
    user.identificationNumber = null;
    user.identificationFrontUrl = null;
    user.identificationBackUrl = null;
    user.vehiclePlate = null;
    user.licenseFrontUrl = null;
    user.licenseBackUrl = null;
    user.soatUrl = null;
    user.technicalInspectionUrl = null;
    user.observations = null;
    user.googleId = null;

    await this._userRepository.save(user);

    if (businesses > 0) {
      await this._organizationalRepository.update(
        { legalPersonId: user.id },
        { isActive: false },
      );
    }

    return { hardDeleted: false };
  }

  /** "Eliminar mi cuenta" con sesión activa (botón en Mi perfil). */
  async requestSelfDeletion(id: string): Promise<{ hardDeleted: boolean }> {
    const user = await this.findOne(id);
    return this.performAccountDeletion(user);
  }

  /**
   * Solicitud de eliminación SIN sesión (paso 1, punto 1b de la auditoría):
   * la página web pública pide el correo; si existe una cuenta se manda un
   * enlace de confirmación (mismo patrón que `generateEmailVerificationToken`
   * — token random + vencimiento). No confirma nada todavía: eso lo hace
   * `confirmDeletionByToken` cuando el usuario abre el enlace, para que nadie
   * pueda borrar una cuenta ajena solo con saber su correo.
   */
  async requestDeletionByEmail(email: string): Promise<void> {
    const user = await this._userRepository.findOne({
      where: { email: email.toLowerCase() },
    });
    if (!user) {
      throw new NotFoundException('No encontramos una cuenta con ese correo.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + DELETION_TOKEN_MINUTES);
    await this._userRepository.update(user.id, {
      deletionRequestToken: token,
      deletionRequestTokenExpiry: expiry,
    });

    const baseUrl =
      this._configService.get<string>('app.baseUrl') || 'http://localhost:3000';
    const confirmLink = `${baseUrl}/user/confirm-deletion?token=${token}&userId=${user.id}`;

    try {
      const body = await this._mailTemplateService.deletionRequestTemplate(
        confirmLink,
        user.fullName,
      );
      await this._mailsService.sendEmail({
        to: user.email,
        subject: 'Confirma la eliminación de tu cuenta',
        body,
        attachments: [bannerAttachment()],
      });
    } catch (error) {
      console.error('Error sending account deletion email:', error);
      throw new HttpException(
        {
          message:
            'No pudimos enviar el correo. Inténtalo de nuevo en unos minutos.',
          code: 'DELETION_EMAIL_FAILED',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Formulario "¿Tienes un negocio?" del registro (antes era un `mailto:`
   * que abría el correo del dispositivo): manda los datos directo al equipo
   * de Mándalo. `replyTo` con el correo del negocio si lo dejó, para que
   * responder el correo vaya directo a él.
   */
  async sendBusinessLead(dto: BusinessLeadDto): Promise<void> {
    try {
      const body = await this._mailTemplateService.businessLeadTemplate(dto);
      await this._mailsService.sendEmail({
        to: BUSINESS_CONTACT_EMAIL,
        subject: `Nuevo negocio interesado: ${dto.businessName}`,
        body,
        replyTo: dto.contactEmail,
        attachments: [bannerAttachment()],
      });
    } catch (error) {
      console.error('Error sending business lead email:', error);
      throw new HttpException(
        {
          message:
            'No pudimos enviar tu solicitud. Inténtalo de nuevo en unos minutos.',
          code: 'BUSINESS_LEAD_EMAIL_FAILED',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Solicitud de eliminación SIN sesión, paso 2: valida el token del enlace
   * del correo y, si es válido y no venció, ejecuta el mismo borrado/baneo
   * que el self-service logueado.
   */
  async confirmDeletionByToken(
    userId: string,
    token: string,
  ): Promise<{ hardDeleted: boolean }> {
    const user = await this._userRepository.findOne({
      where: { id: userId, deletionRequestToken: token },
    });
    if (!user) {
      throw new BadRequestException(
        'El enlace no es válido o ya fue utilizado.',
      );
    }
    if (
      !user.deletionRequestTokenExpiry ||
      user.deletionRequestTokenExpiry < new Date()
    ) {
      throw new BadRequestException(
        'El enlace expiró. Vuelve a solicitar la eliminación de tu cuenta.',
      );
    }

    return this.performAccountDeletion(user);
  }

  /**
   * Cambio de contraseña del propio usuario: exige la contraseña actual.
   * Las cuentas creadas con Google tienen una contraseña aleatoria que el
   * usuario no conoce — su camino es "olvidé mi contraseña" (código al correo).
   */
  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.findOne(id);

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }

    const password = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this._userRepository.update(id, { password });
  }

  /**
   * Vincula una cuenta de Google al usuario YA autenticado (botón "Vincular
   * con Google" del perfil). El correo de Google no tiene que coincidir con
   * el de la cuenta; lo único prohibido es que ese googleId ya pertenezca a
   * OTRO usuario.
   */
  async linkGoogleAccount(
    userId: string,
    profile: GoogleUserProfile,
  ): Promise<void> {
    const existing = await this._userRepository.findOne({
      where: { googleId: profile.googleId },
    });
    if (existing && existing.id !== userId) {
      throw new ConflictException(
        'Esa cuenta de Google ya está vinculada a otro usuario',
      );
    }
    if (existing) return; // ya estaba vinculada a esta misma cuenta

    const user = await this.findOne(userId);
    await this._userRepository.update(userId, {
      googleId: profile.googleId,
      // El avatar de Google solo entra si el usuario no tiene foto propia.
      avatarUrl: user.avatarUrl || profile.avatarUrl,
    });
  }

  /**
   * Onboarding post-Google: convierte la cuenta autenticada en REPARTIDOR.
   * Exige las mismas fotos de verificación del registro DELI normal y deja
   * la cuenta INACTIVA para que un admin la revise. El avatar de Google se
   * reemplaza por la foto del rostro (es la que revisa el admin).
   */
  async becomeDelivery(
    userId: string,
    dto: BecomeDeliveryDto,
    files?: RegisterDeliveryFiles,
  ): Promise<void> {
    if (!files?.avatar?.[0]) {
      throw new BadRequestException('La foto de tu rostro es obligatoria');
    }
    if (!files?.idFront?.[0] || !files?.idBack?.[0]) {
      throw new BadRequestException(
        'Las fotos de tu documento (por delante y por detrás) son obligatorias',
      );
    }
    if (!files?.licenseFront?.[0] || !files?.licenseBack?.[0]) {
      throw new BadRequestException(
        'Las fotos de tu licencia de conducción (por delante y por detrás) son obligatorias',
      );
    }
    if (!files?.soat?.[0]) {
      throw new BadRequestException('El SOAT es obligatorio (foto o PDF)');
    }
    if (!files?.technicalInspection?.[0]) {
      throw new BadRequestException(
        'La tecnomecánica es obligatoria (foto o PDF)',
      );
    }

    const user = await this.findOne(userId);
    if (user.roleType?.code === RoleTypeCode.ADMIN) {
      throw new BadRequestException(
        'Una cuenta de administrador no puede volverse repartidor.',
      );
    }

    const identificationType = await this._identificationTypeRepository.findOne(
      { where: { id: dto.identificationTypeId } },
    );
    if (!identificationType) {
      throw new BadRequestException('El tipo de identificación no es válido');
    }
    if (dto.identificationNumber !== user.identificationNumber) {
      await this.assertIdentificationAvailable(dto.identificationNumber);
    }

    const roleType = await this._roleTypeRepository.findOne({
      where: { code: RoleTypeCode.DELIVERY },
    });
    if (!roleType) {
      throw new BadRequestException(
        'El rol de repartidor no está configurado en la base de datos',
      );
    }

    const [avatar, idFront, idBack, licenseFront, licenseBack, soat, technicalInspection] =
      await this.saveAllOrCleanup([
        this._localStorageService.saveImage(files.avatar[0], 'users'),
        this._localStorageService.saveImage(files.idFront[0], 'users'),
        this._localStorageService.saveImage(files.idBack[0], 'users'),
        this._localStorageService.saveImage(files.licenseFront[0], 'users'),
        this._localStorageService.saveImage(files.licenseBack[0], 'users'),
        this._localStorageService.saveDocument(files.soat[0], 'users'),
        this._localStorageService.saveDocument(
          files.technicalInspection[0],
          'users',
        ),
      ]);

    await this._userRepository.update(userId, {
      roleTypeId: roleType.id,
      isActive: false,
      identificationNumber: dto.identificationNumber,
      identificationTypeId: dto.identificationTypeId,
      vehiclePlate: dto.vehiclePlate.trim().toUpperCase(),
      avatarUrl: avatar.imageUrl,
      identificationFrontUrl: idFront.imageUrl,
      identificationBackUrl: idBack.imageUrl,
      licenseFrontUrl: licenseFront.imageUrl,
      licenseBackUrl: licenseBack.imageUrl,
      soatUrl: soat.imageUrl,
      technicalInspectionUrl: technicalInspection.imageUrl,
      // El DTO ya exige acceptedTerms === true (class-validator).
      termsAcceptedAt: new Date(),
      termsVersion: CURRENT_TERMS_VERSION,
    });
  }

  /**
   * Reenvío de documentos del repartidor (perfil propio): sirve para
   * corregir un documento que el admin rechazó (nota en `observations`) o
   * para renovar uno vencido (SOAT, tecnomecánica, licencia). Todo opcional —
   * solo se reemplaza lo que venga en `files`/`dto.vehiclePlate`; el archivo
   * viejo se borra del disco DESPUÉS de guardar el nuevo (si algo falla no se
   * pierde el documento anterior). Limpia `observations`: el repartidor ya
   * respondió, le toca al admin revisar de nuevo (no reactiva la cuenta sola).
   */
  async resendDeliveryDocuments(
    userId: string,
    dto: ResendDeliveryDocumentsDto,
    files?: RegisterDeliveryFiles,
  ): Promise<void> {
    const user = await this.findOne(userId);
    if (user.roleType?.code !== RoleTypeCode.DELIVERY) {
      throw new BadRequestException(
        'Esta acción es solo para cuentas de repartidor',
      );
    }
    // Una vez el admin VERIFICA y activa la cuenta, los documentos quedan
    // congelados: el repartidor ya no puede cambiarlos ni la placa (para
    // renovar/corregir algo debe pedírselo al administrador). Los datos de
    // ubicación/identificación del perfil (cédula, tipo, depto, municipio,
    // dirección) sí siguen editables por si viaja a trabajar a otra ciudad.
    if (user.isActive) {
      throw new BadRequestException(
        'Tu cuenta ya está verificada: no puedes cambiar tus documentos. Si necesitas actualizar alguno, contacta al administrador.',
      );
    }

    const IMAGE_FIELDS: Array<[keyof RegisterDeliveryFiles, keyof User]> = [
      ['avatar', 'avatarUrl'],
      ['idFront', 'identificationFrontUrl'],
      ['idBack', 'identificationBackUrl'],
      ['licenseFront', 'licenseFrontUrl'],
      ['licenseBack', 'licenseBackUrl'],
    ];
    const DOCUMENT_FIELDS: Array<[keyof RegisterDeliveryFiles, keyof User]> = [
      ['soat', 'soatUrl'],
      ['technicalInspection', 'technicalInspectionUrl'],
    ];

    const updates: Record<string, string | null> = {};
    const oldPublicIds: string[] = [];
    // Si un archivo falla a mitad del for (varios documentos en una sola
    // llamada), los que sí se alcanzaron a guardar antes quedarían huérfanos.
    const newPublicIds: string[] = [];

    try {
      for (const [fileKey, column] of [...IMAGE_FIELDS, ...DOCUMENT_FIELDS]) {
        const file = files?.[fileKey]?.[0];
        if (!file) continue;

        const isDocument = DOCUMENT_FIELDS.some(([key]) => key === fileKey);
        const { imageUrl, publicId } = isDocument
          ? await this._localStorageService.saveDocument(file, 'users')
          : await this._localStorageService.saveImage(file, 'users');
        newPublicIds.push(publicId);

        const oldPublicId = this._localStorageService.publicIdFromUrl(
          user[column] as string | undefined,
        );
        if (oldPublicId) oldPublicIds.push(oldPublicId);
        updates[column] = imageUrl;
      }
    } catch (err) {
      for (const publicId of newPublicIds) {
        await this._localStorageService.deleteImage(publicId);
      }
      throw err;
    }

    if (dto.vehiclePlate?.trim()) {
      updates.vehiclePlate = dto.vehiclePlate.trim().toUpperCase();
    }

    if (Object.keys(updates).length === 0) {
      throw new BadRequestException(
        'Sube al menos un documento nuevo o cambia la placa',
      );
    }

    updates.observations = null;

    await this._userRepository.update(userId, updates);
    for (const publicId of oldPublicIds) {
      await this._localStorageService.deleteImage(publicId);
    }
  }

  /**
   * Quita el vínculo con Google. La cuenta sigue entrando por correo +
   * contraseña (si nació con Google y nunca la definió, se recupera con
   * "¿Olvidaste tu contraseña?"). El avatar no se toca.
   */
  async unlinkGoogleAccount(userId: string): Promise<void> {
    const user = await this.findOne(userId);
    if (!user.googleId) {
      throw new BadRequestException('Tu cuenta no está vinculada con Google.');
    }
    await this._userRepository.update(userId, { googleId: null });
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

  /** Quita la foto de perfil (opcional): borra el archivo del disco y limpia la columna. */
  async removeAvatar(id: string): Promise<void> {
    const user = await this.findOne(id);
    const publicId = this._localStorageService.publicIdFromUrl(user.avatarUrl);
    await this._userRepository.update(id, { avatarUrl: null });
    if (publicId) {
      await this._localStorageService.deleteImage(publicId);
    }
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
