// Manda TODAS las plantillas de correo (+ las 2 páginas de resultado web)
// de la app a un correo de revisión, usando la MISMA clase de plantillas que
// usa el backend en producción — así lo que se ve es exactamente lo real, no
// una copia a mano que se puede desactualizar. Se conecta con las mismas
// credenciales SMTP que .env.development (misma cuenta Gmail que prod, ver
// NOTAS.md §67). No toca la base de datos ni crea ninguna cuenta.
//
// Uso: npx ts-node scripts/send-template-previews.ts

import * as fs from 'fs';
import * as path from 'path';
import * as nodemailer from 'nodemailer';
import {
  bannerAttachment,
  MailTemplateService,
} from '../src/shared/services/mail-template.service';
import { AppSettingsRepository } from '../src/shared/repositories/appSettings.repository';
import { RoleTypeCode } from '../src/shared/roles/roleTypeCode.enum';

const RECIPIENT = 'jhonlegarda1.2@gmail.com';

const envFile = path.join(__dirname, '..', '.env.development');
const env: Record<string, string> = {};
for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const transporter = nodemailer.createTransport({
  host: env.MAIL_HOST,
  port: Number(env.MAIL_PORT) || 587,
  secure: env.MAIL_SECURE === 'true',
  auth: { user: env.MAIL_USER, pass: env.MAIL_PASSWORD },
  pool: true,
  maxConnections: 1,
  rateDelta: 1000,
  rateLimit: 1,
});

// Misma conversión a texto plano que `mails.service.ts` (evita caer en spam).
function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function send(
  label: string,
  subject: string,
  htmlOrPromise: string | Promise<string>,
) {
  const html = await htmlOrPromise;
  await transporter.sendMail({
    from: env.MAIL_SENDER,
    to: RECIPIENT,
    subject,
    html,
    text: htmlToPlainText(html),
    // El banner va SIEMPRE embebido por CID en el correo real (Gmail no
    // renderiza el `data:` URI que llevan las plantillas cuando se abren en
    // un navegador) — mismo adjunto que ya manda `UserService` de verdad.
    attachments: [bannerAttachment()],
  });
  console.log('✅ Enviado:', label);
}

async function main() {
  // Script standalone, fuera del contenedor de NestJS: no arma una conexión
  // real a la base de datos, así que las plantillas caen a los colores de
  // marca por defecto (mismo comportamiento que en la app real cuando
  // `appSettings` todavía no tiene fila) en vez de los que el admin haya
  // configurado en producción/dev — para previsualizar con colores en vivo,
  // usar el endpoint `GET /user/bulk-invite/preview` en cambio.
  const stubRepository = {
    findOne: async () => null,
  } as unknown as AppSettingsRepository;
  const svc = new MailTemplateService(stubRepository);
  const DUMMY_NAME = 'Juan Pérez';

  await send(
    '1/7 Verificación de correo',
    '[PREVIEW] Verifica tu correo electrónico',
    svc.verifyEmailTemplate(
      'https://apidev.somosmandalo.com/user/verify-email?token=preview-token&userId=preview-id',
      DUMMY_NAME,
    ),
  );

  await send(
    '2/7 Restablecer contraseña',
    '[PREVIEW] Restablece tu contraseña',
    svc.resetPasswordTemplate('482913', DUMMY_NAME),
  );

  await send(
    '3/7 Confirmar eliminación de cuenta',
    '[PREVIEW] Confirma la eliminación de tu cuenta',
    svc.deletionRequestTemplate(
      'https://apidev.somosmandalo.com/user/confirm-deletion?token=preview-token&userId=preview-id',
      DUMMY_NAME,
    ),
  );

  await send(
    '4/7 Nuevo negocio interesado (interno)',
    '[PREVIEW] Nuevo negocio interesado',
    svc.businessLeadTemplate({
      businessName: 'Restaurante El Sabor',
      ownerName: 'María Gómez',
      phone: '3201234567',
      contactEmail: 'maria@example.com',
      identificationNumber: '1085123456',
      businessType: 'Restaurante',
      municipalityAddress: 'Mocoa, Cra 5 # 10-20',
    }),
  );

  await send(
    '5/7 Bienvenida — Cliente (alta masiva)',
    '[PREVIEW] ¡Tu cuenta de Cliente en Mandalo ya está lista!',
    svc.bulkInviteWelcomeTemplate(
      DUMMY_NAME,
      RECIPIENT,
      'MandaloCliente',
      RoleTypeCode.CLIENT,
    ),
  );

  await send(
    '6/7 Bienvenida — Negocio (alta masiva)',
    '[PREVIEW] ¡Tu cuenta de Negocio en Mandalo ya está lista!',
    svc.bulkInviteWelcomeTemplate(
      DUMMY_NAME,
      RECIPIENT,
      'MandaloNegocio',
      RoleTypeCode.BUSINESS,
    ),
  );

  await send(
    '7/7 Bienvenida — Domiciliario (alta masiva)',
    '[PREVIEW] ¡Tu cuenta de Domiciliario en Mandalo ya está lista!',
    svc.bulkInviteWelcomeTemplate(
      DUMMY_NAME,
      RECIPIENT,
      'MandaloDomiciliario',
      RoleTypeCode.DELIVERY,
    ),
  );

  transporter.close();
  console.log('\nListo — 7 correos de preview enviados a', RECIPIENT);
  console.log(
    '\nLas 2 páginas de resultado (verificación / eliminación de cuenta) NO son correos — son',
    'páginas web reales. Ábrelas directo en el navegador (con el backend local corriendo):',
  );
  console.log('  http://localhost:3000/user/verify-email/preview');
  console.log('  http://localhost:3000/user/confirm-deletion/preview');
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
