import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { MailerModule } from '@nestjs-modules/mailer';
import { MailsService } from './services/mails.service';
import { MailTemplateService } from './services/mail-template.service';
import { RolesGuard } from './guards/roles.guard';
import { User } from './entities/user.entity';
import { AccessSessions } from './entities/accessSessions.entity';
import { Organizational } from './entities/organizational.entity';
import { RoleType } from './entities/roleType.entity';
import { Department } from './entities/department.entity';
import { Municipality } from './entities/municipality.entity';
import { IdentificationType } from './entities/identificationType.entity';
import { CategoryType } from './entities/categoryType.entity';
import { StateType } from './entities/stateType.entity';
import { PaidType } from './entities/paidType.entity';
import { Tag } from './entities/tag.entity';
import { Product } from './entities/product.entity';
import { UserRepository } from './repositories/user.repository';
import { AccessSessionsRepository } from './repositories/accessSessions.repository';
import { OrganizationalRepository } from './repositories/organizational.repository';
import { RoleTypeRepository } from './repositories/roleType.repository';
import { DepartmentRepository } from './repositories/department.repository';
import { MunicipalityRepository } from './repositories/municipality.repository';
import { IdentificationTypeRepository } from './repositories/identificationType.repository';
import { CategoryTypeRepository } from './repositories/categoryType.repository';
import { StateTypeRepository } from './repositories/stateType.repository';
import { PaidTypeRepository } from './repositories/paidType.repository';
import { TagRepository } from './repositories/tag.repository';
import { ProductRepository } from './repositories/product.repository';

@Module({})
export class SharedModule {
  static forRoot(): DynamicModule {
    return {
      global: true,
      module: SharedModule,
      imports: [
        TypeOrmModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => {
            const dbHost = configService.get('DB_HOST');
            const isLocal = dbHost === 'localhost' || dbHost === '127.0.0.1';
            const sslEnabled =
              configService.get('DB_SSL') === 'true' && !isLocal;

            const config: any = {
              type: 'postgres',
              host: configService.get('DB_HOST'),
              port: configService.get<number>('DB_PORT'),
              username: configService.get('DB_USERNAME'),
              password: configService.get('DB_PASSWORD'),
              database: configService.get('DB_DATABASE'),
              autoLoadEntities: true,
              synchronize: false,
              logging: false,
              extra: {
                keepAlive: true,
                max: 20,
                idleTimeoutMillis: 60000,
                connectionTimeoutMillis: 60000,
              },
            };

            if (sslEnabled) {
              config.ssl = true;
              config.extra = {
                ...config.extra,
                ssl: { rejectUnauthorized: false },
              };
            }

            return config;
          },
        }),

        TypeOrmModule.forFeature([
          User,
          AccessSessions,
          Organizational,
          RoleType,
          Department,
          Municipality,
          IdentificationType,
          CategoryType,
          StateType,
          PaidType,
          Tag,
          Product,
        ]),

        PassportModule,
        PassportModule.register({ defaultStrategy: 'jwt' }),

        JwtModule.registerAsync({
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            secret: configService.get('JWT_SECRET_KEY'),
            signOptions: {
              expiresIn: configService.get('JWT_EXPIRES_IN') || '24h',
            },
          }),
        }),

        MailerModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            transport: {
              host: configService.get<string>('MAIL_HOST'),
              port: parseInt(configService.get('MAIL_PORT'), 10) || 587,
              secure: configService.get('MAIL_SECURE') === 'true',
              auth: {
                user: configService.get<string>('MAIL_USER'),
                pass: configService.get<string>('MAIL_PASSWORD'),
              },
            },
            defaults: {
              from: configService.get<string>('MAIL_SENDER'),
            },
          }),
        }),
      ],
      providers: [
        RolesGuard,
        MailsService,
        MailTemplateService,
        UserRepository,
        AccessSessionsRepository,
        OrganizationalRepository,
        RoleTypeRepository,
        DepartmentRepository,
        MunicipalityRepository,
        IdentificationTypeRepository,
        CategoryTypeRepository,
        StateTypeRepository,
        PaidTypeRepository,
        TagRepository,
        ProductRepository,
      ],
      exports: [
        JwtModule,
        TypeOrmModule,
        RolesGuard,
        MailsService,
        MailTemplateService,
        UserRepository,
        AccessSessionsRepository,
        OrganizationalRepository,
        RoleTypeRepository,
        DepartmentRepository,
        MunicipalityRepository,
        IdentificationTypeRepository,
        CategoryTypeRepository,
        StateTypeRepository,
        PaidTypeRepository,
        TagRepository,
        ProductRepository,
      ],
    };
  }
}
