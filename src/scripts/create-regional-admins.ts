import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { config } from '../config';
import { SharedModule } from '../shared/shared.module';
import { UserModule } from '../user/user.module';
import { UserService } from '../user/services/user.service';
import { RoleTypeCode } from '../shared/roles/roleTypeCode.enum';

/**
 * Alta puntual de 4 cuentas ADMIN regionales (pedido 2026-08-13) — no usa
 * `bulkInvite` porque ese endpoint excluye ADMIN a propósito (contraseña fija
 * compartida solo para Cliente/Negocio/Domiciliario). Acá cada admin tiene su
 * propia contraseña (nombre del municipio, primera en mayúscula, + "@1.2",
 * pedido explícito del cliente) y NO se manda correo — se le avisa a mano.
 *
 *   cross-env NODE_ENV=production ts-node src/scripts/create-regional-admins.ts
 */
const ADMINS: { email: string; fullName: string; password: string }[] = [
  { email: 'adminhormiga@gmail.com', fullName: 'Admin Hormiga', password: 'Hormiga@1.2' },
  { email: 'adminvillagarzon@gmail.com', fullName: 'Admin Villagarzón', password: 'Villagarzon@1.2' },
  { email: 'adminpuertoasis@gmail.com', fullName: 'Admin Puerto Asís', password: 'Puertoasis@1.2' },
  { email: 'adminorito@gmail.com', fullName: 'Admin Orito', password: 'Orito@1.2' },
];

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
    SharedModule.forRoot(),
    UserModule,
  ],
})
class ScriptModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(ScriptModule, {
    logger: ['error', 'warn'],
  });

  const userService = app.get(UserService);

  for (const admin of ADMINS) {
    try {
      await userService.create({
        fullName: admin.fullName,
        email: admin.email,
        password: admin.password,
        roleTypeCode: RoleTypeCode.ADMIN,
      });
      console.log(`Creado: ${admin.email}`);
    } catch (error) {
      console.error(`Falló ${admin.email}:`, error.message ?? error);
    }
  }

  await app.close();
}

main().catch((error) => {
  console.error('Falló el script:', error);
  process.exit(1);
});
