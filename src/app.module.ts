import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { createKeyv } from '@keyv/redis';
import { ThrottlerModule } from '@nestjs/throttler';
import { PassportModule } from '@nestjs/passport';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { config } from './config';
import { SharedModule } from './shared/shared.module';
import { ApiKeyGuard } from './shared/guards/api-key.guard';
import { ClientIpThrottlerGuard } from './shared/guards/client-ip-throttler.guard';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { CatalogModule } from './catalog/catalog.module';
import { CategoryTypeModule } from './categoryType/categoryType.module';
import { TagModule } from './tag/tag.module';
import { OrganizationalModule } from './organizational/organizational.module';
import { ProductModule } from './product/product.module';
import { UserAddressModule } from './userAddress/userAddress.module';
import { ExploreModule } from './explore/explore.module';
import { InvoiceModule } from './invoice/invoice.module';
import { ChatModule } from './chat/chat.module';
import { SettlementModule } from './settlement/settlement.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [config],
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? '.env.production'
          : '.env.development',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 500,
      },
    ]),
    // Caché de respuestas públicas-iguales-para-todos (/catalog, /explore) —
    // ver plan en NOTAS §21. Sin REDIS_URL usa memoria (Keyv, cero infra);
    // con REDIS_URL (Dokploy) migra el store a Redis sin tocar código.
    // NUNCA cachear con CacheInterceptor lo autenticado-personal
    // (/user-address, /invoice, /organizational/mine, /product).
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL || '';
        return {
          ttl: 60_000, // default (ms); cada endpoint lo ajusta con @CacheTTL
          ...(redisUrl ? { stores: [createKeyv(redisUrl)] } : {}),
        };
      },
    }),
    // Sirve las imágenes subidas (avatares, logos, productos) en /uploads.
    // Mismo directorio que usa LocalStorageService; en el VPS es un bind
    // mount de Dokploy para que sobreviva a los redeploys.
    ServeStaticModule.forRoot({
      rootPath:
        process.platform === 'win32'
          ? join(process.cwd(), 'uploads')
          : '/app/uploads',
      serveRoot: '/uploads',
      serveStaticOptions: {
        setHeaders: (res) => {
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Access-Control-Allow-Origin', '*');
        },
      },
    }),
    SharedModule.forRoot(),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    AuthModule,
    UserModule,
    CatalogModule,
    CategoryTypeModule,
    TagModule,
    OrganizationalModule,
    ProductModule,
    UserAddressModule,
    ExploreModule,
    InvoiceModule,
    ChatModule,
    SettlementModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ClientIpThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
