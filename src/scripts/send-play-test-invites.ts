import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { config } from '../config';
import { SharedModule } from '../shared/shared.module';
import { MailsService } from '../shared/services/mails.service';
import {
  MailTemplateService,
  bannerAttachment,
} from '../shared/services/mail-template.service';

/**
 * Invitación a la prueba anticipada de Google Play (closed testing) —
 * reemplaza el plan de "alta masiva con contraseña" (`user.bulkInvite`, §72):
 * este correo NO crea cuentas, solo pide entrar al listado de Play Store,
 * instalar y aceptar ser tester (ver `playTestInviteTemplate`).
 *
 * Solo importa `SharedModule` (no todo `AppModule`) para no levantar cron
 * jobs/backup/throttler de más — acá solo hace falta DB (colores de marca
 * en vivo) + el mailer ya configurado con pooling/rate-limit para Gmail
 * (1/seg, NOTAS §67 — por eso el envío tarda ~1seg por correo, es esperado).
 *
 *   cross-env NODE_ENV=development ts-node src/scripts/send-play-test-invites.ts
 *   cross-env NODE_ENV=development ts-node src/scripts/send-play-test-invites.ts correo@suelto.com
 *
 * Sin argumentos: manda a `correosusers.csv` (raíz del monorepo, un correo
 * por línea, CRLF) — ya confirmado por el usuario para el listado completo.
 * Con argumentos: manda SOLO a los correos pasados por línea de comandos
 * (para invitaciones sueltas, sin tocar el CSV).
 */
const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.mandalo.app';

const CSV_PATH = join(__dirname, '../../../correosusers.csv');

function loadRecipients(): string[] {
  const cliArgs = process.argv.slice(2).map((a) => a.trim()).filter(Boolean);
  if (cliArgs.length > 0) return [...new Set(cliArgs)];

  if (!existsSync(CSV_PATH)) {
    throw new Error(`No se encontró el CSV en ${CSV_PATH}`);
  }
  const lines = readFileSync(CSV_PATH, 'utf-8').split(/\r?\n/);
  const emails = lines.map((l) => l.trim()).filter(Boolean);
  return [...new Set(emails)];
}

const RECIPIENTS = loadRecipients();

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
  ],
})
class ScriptModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(ScriptModule, {
    logger: ['error', 'warn'],
  });

  const mailsService = app.get(MailsService);
  const mailTemplateService = app.get(MailTemplateService);

  const html = await mailTemplateService.playTestInviteTemplate(PLAY_STORE_URL);

  for (const to of RECIPIENTS) {
    await mailsService.sendEmail({
      to,
      subject: '🎉 Ya eres parte de la prueba anticipada de Mandalo',
      body: html,
      attachments: [bannerAttachment()],
    });
    console.log(`Enviado a ${to}`);
  }

  await app.close();
}

main().catch((error) => {
  console.error('Falló el envío:', error);
  process.exit(1);
});
