import { Injectable } from '@nestjs/common';
import { MANDALO_BANNER_BASE64 } from '../constants/mandaloBanner.constant';
import { MailAttachment } from '../interfaces/mail.interface';
import { RoleTypeCode } from '../roles/roleTypeCode.enum';

const BRAND = {
  name: 'Mandalo',
  slogan: 'LO PIDES, LO MANDAMOS.',
  primary: '#FF5A3C',
  dark: '#1E1E2D',
  muted: '#7A7A8A',
  surface: '#F2F2F2',
};

/**
 * CID del banner de marca dentro del correo (`cid:mandalo-banner`) — el
 * adjunto real lo agrega `bannerAttachment()` a cada `sendEmail()` que use
 * una plantilla con `bannerSrc` por defecto (ver abajo).
 */
export const MANDALO_BANNER_CID = 'mandalo-banner';

/**
 * Adjunto embebido del banner para pasarle a `MailsService.sendEmail`. Por
 * qué CID y no `data:` URI en el body: Gmail (y varios clientes más) no
 * renderiza imágenes base64 inline de forma confiable dentro del CUERPO del
 * correo — el CID es el mecanismo MIME estándar para logos de correo,
 * soportado en todos lados sin depender de que el cliente cargue imágenes
 * remotas ni de que acepte `data:` URIs.
 */
export function bannerAttachment(): MailAttachment {
  return {
    filename: 'mandalo-banner.png',
    content: Buffer.from(MANDALO_BANNER_BASE64, 'base64'),
    cid: MANDALO_BANNER_CID,
  };
}

/** Data URI del banner — SOLO para páginas servidas directo a un navegador
 * (páginas de resultado, preview del admin), donde `data:` sí funciona bien. */
const BANNER_DATA_URI = `data:image/png;base64,${MANDALO_BANNER_BASE64}`;

/** Filas de la tabla del correo con el banner completo (logo + wordmark +
 * eslogan, ya está todo en la imagen) — reemplaza el bloque de texto suelto
 * "Mandalo" + eslogan que tenían las plantillas antes. Las esquinas quedan
 * redondeadas solas por el `overflow: hidden` de la tabla contenedora. */
function bannerRow(src: string) {
  return `
                <tr>
                  <td style="padding: 0; line-height: 0;">
                    <img src="${src}" alt="${BRAND.name}" style="display: block; width: 100%; height: auto; border: 0;" />
                  </td>
                </tr>`;
}

/**
 * Plantillas HTML de los correos transaccionales y de las páginas que sirve
 * el backend (p. ej. el resultado de la verificación de correo), con la
 * identidad de marca de Mándalo.
 */
@Injectable()
export class MailTemplateService {
  verifyEmailTemplate(
    verifyLink: string,
    fullName: string,
    bannerSrc: string = `cid:${MANDALO_BANNER_CID}`,
  ) {
    return `
      <div style="margin: 0; padding: 0; background-color: ${BRAND.surface}; font-family: 'Helvetica', Arial, sans-serif; width: 100%;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${BRAND.surface}; padding: 40px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                ${bannerRow(bannerSrc)}
                <tr>
                  <td style="padding: 34px 30px 40px;">
                    <div style="text-align: center; margin-bottom: 26px;">
                      <h2 style="color: ${BRAND.dark}; margin: 0; font-size: 20px; font-weight: 700;">Verifica tu correo electrónico</h2>
                    </div>
                    <p style="color: ${BRAND.muted}; font-size: 16px; line-height: 24px; margin-bottom: 20px;">
                      ¡Hola <strong style="color: ${BRAND.dark};">${fullName || ''}</strong>!
                    </p>
                    <p style="color: ${BRAND.muted}; font-size: 16px; line-height: 24px; margin-bottom: 25px;">
                      Gracias por registrarte en <strong style="color: ${BRAND.dark};">${BRAND.name}</strong>.
                      Para activar tu cuenta haz clic en el botón de abajo.
                    </p>
                    <div style="text-align: center; margin: 35px 0;">
                      <a href="${verifyLink}" target="_blank"
                        style="background-color: ${BRAND.primary}; color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 30px; font-weight: 700; font-size: 16px; display: inline-block;">
                        Verificar mi cuenta
                      </a>
                    </div>
                    <p style="color: ${BRAND.muted}; font-size: 13px; line-height: 20px; margin-bottom: 0;">
                      El enlace vence en <strong>30 minutos</strong>. Si no fuiste tú quien se registró, ignora este correo.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: ${BRAND.dark}; padding: 18px 30px; text-align: center;">
                    <p style="color: #ffffff; font-size: 12px; margin: 0;">© ${BRAND.name} — ${BRAND.slogan}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  /**
   * Correo con el código de 6 dígitos para restablecer la contraseña
   * (el usuario lo digita en la app; no hay enlaces ni deep links).
   *
   * Nota sobre "botón de copiar": no existe una forma confiable de hacerlo
   * en un correo real — los clientes de correo (Gmail, Outlook, Apple Mail…)
   * eliminan cualquier `<script>`, así que un botón "Copiar" no podría tocar
   * el portapapeles. Lo que sí ayuda (y ya está) es un código grande, con
   * mucho espaciado entre dígitos, fácil de leer y teclear a mano.
   */
  resetPasswordTemplate(
    code: string,
    fullName: string,
    bannerSrc: string = `cid:${MANDALO_BANNER_CID}`,
  ) {
    return `
      <div style="margin: 0; padding: 0; background-color: ${BRAND.surface}; font-family: 'Helvetica', Arial, sans-serif; width: 100%;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${BRAND.surface}; padding: 40px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                ${bannerRow(bannerSrc)}
                <tr>
                  <td style="padding: 34px 30px 40px;">
                    <div style="text-align: center; margin-bottom: 26px;">
                      <h2 style="color: ${BRAND.dark}; margin: 0; font-size: 20px; font-weight: 700;">Restablece tu contraseña</h2>
                    </div>
                    <p style="color: ${BRAND.muted}; font-size: 16px; line-height: 24px; margin-bottom: 20px;">
                      ¡Hola <strong style="color: ${BRAND.dark};">${fullName || ''}</strong>!
                    </p>
                    <p style="color: ${BRAND.muted}; font-size: 16px; line-height: 24px; margin-bottom: 25px;">
                      Recibimos una solicitud para restablecer tu contraseña en
                      <strong style="color: ${BRAND.dark};">${BRAND.name}</strong>.
                      Escribe este código en la app:
                    </p>
                    <div style="text-align: center; margin: 35px 0;">
                      <div style="display: inline-block; background: ${BRAND.surface}; border-radius: 16px; padding: 18px 30px; font-size: 34px; font-weight: 800; letter-spacing: 10px; color: ${BRAND.dark};">${code}</div>
                    </div>
                    <p style="color: ${BRAND.muted}; font-size: 13px; line-height: 20px; margin-bottom: 0;">
                      El código vence en <strong>15 minutos</strong>. Si no solicitaste el cambio, ignora este correo — tu contraseña seguirá siendo la misma.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: ${BRAND.dark}; padding: 18px 30px; text-align: center;">
                    <p style="color: #ffffff; font-size: 12px; margin: 0;">© ${BRAND.name} — ${BRAND.slogan}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  /**
   * Página HTML que ve el usuario al abrir el enlace de verificación
   * (la app es móvil, así que el backend sirve esta página directamente).
   * SOLO se abre en un navegador real (nunca por correo) — ahí el `data:`
   * URI del banner y el centrado vertical (`min-height: 100vh` + flex) sí
   * funcionan bien; para verla renderizada de verdad usa
   * `GET /user/verify-email/preview`, no la mandes por correo.
   */
  verifyEmailResultPage(success: boolean, message: string) {
    const icon = success ? '✓' : '✕';
    const iconBg = success ? '#22C55E' : '#EF4444';
    const title = success ? '¡Cuenta verificada!' : 'No se pudo verificar';
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — ${BRAND.name}</title>
</head>
<body style="margin: 0; background-color: ${BRAND.surface}; font-family: 'Helvetica', Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh;">
  <div style="background: #ffffff; border-radius: 20px; overflow: hidden; max-width: 380px; width: 90%; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
    <img src="${BANNER_DATA_URI}" alt="${BRAND.name}" style="display: block; width: 100%; height: auto; border: 0;" />
    <div style="padding: 30px 30px 36px; text-align: center;">
      <div style="width: 70px; height: 70px; border-radius: 50%; background: ${iconBg}; color: #fff; font-size: 36px; line-height: 70px; margin: 0 auto 20px;">${icon}</div>
      <h2 style="color: ${BRAND.dark}; margin: 0 0 10px; font-size: 20px;">${title}</h2>
      <p style="color: ${BRAND.muted}; font-size: 15px; line-height: 22px; margin: 0;">${message}</p>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Correo de confirmación de "eliminar mi cuenta" SIN sesión (página web
   * pública, punto 1b de la auditoría de Google Play — ver NOTAS.md §49).
   * Tono de advertencia: la acción es irreversible.
   */
  deletionRequestTemplate(
    confirmLink: string,
    fullName: string,
    bannerSrc: string = `cid:${MANDALO_BANNER_CID}`,
  ) {
    return `
      <div style="margin: 0; padding: 0; background-color: ${BRAND.surface}; font-family: 'Helvetica', Arial, sans-serif; width: 100%;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${BRAND.surface}; padding: 40px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background-color: #DC2626; height: 6px;"></td>
                </tr>
                ${bannerRow(bannerSrc)}
                <tr>
                  <td style="padding: 34px 30px 40px;">
                    <div style="text-align: center; margin-bottom: 26px;">
                      <h2 style="color: ${BRAND.dark}; margin: 0; font-size: 20px; font-weight: 700;">Confirma la eliminación de tu cuenta</h2>
                    </div>
                    <p style="color: ${BRAND.muted}; font-size: 16px; line-height: 24px; margin-bottom: 20px;">
                      ¡Hola <strong style="color: ${BRAND.dark};">${fullName || ''}</strong>!
                    </p>
                    <p style="color: ${BRAND.muted}; font-size: 16px; line-height: 24px; margin-bottom: 25px;">
                      Recibimos una solicitud para eliminar tu cuenta de <strong style="color: ${BRAND.dark};">${BRAND.name}</strong>.
                      Esta acción <strong style="color: #DC2626;">no se puede deshacer</strong>. Si fuiste tú, confirma con el botón de abajo.
                    </p>
                    <div style="text-align: center; margin: 35px 0;">
                      <a href="${confirmLink}" target="_blank"
                        style="background-color: #DC2626; color: #ffffff; padding: 15px 40px; text-decoration: none; border-radius: 30px; font-weight: 700; font-size: 16px; display: inline-block;">
                        Eliminar mi cuenta
                      </a>
                    </div>
                    <p style="color: ${BRAND.muted}; font-size: 13px; line-height: 20px; margin-bottom: 0;">
                      El enlace vence en <strong>30 minutos</strong>. Si no fuiste tú, ignora este correo — tu cuenta sigue igual.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: ${BRAND.dark}; padding: 18px 30px; text-align: center;">
                    <p style="color: #ffffff; font-size: 12px; margin: 0;">© ${BRAND.name} — ${BRAND.slogan}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  /**
   * Correo al equipo de Mándalo con los datos de un negocio interesado en
   * registrarse (formulario de "¿Tienes un negocio?" en /auth/register —
   * antes era un `mailto:` que abría el correo del dispositivo).
   */
  businessLeadTemplate(
    lead: {
      businessName: string;
      ownerName: string;
      phone: string;
      contactEmail?: string;
      identificationNumber?: string;
      businessType: string;
      municipalityAddress: string;
    },
    bannerSrc: string = `cid:${MANDALO_BANNER_CID}`,
  ) {
    const row = (label: string, value?: string) =>
      value
        ? `
                    <tr>
                      <td style="padding: 8px 0; color: ${BRAND.muted}; font-size: 13px; width: 42%; vertical-align: top;">${label}</td>
                      <td style="padding: 8px 0; color: ${BRAND.dark}; font-size: 14px; font-weight: 600; vertical-align: top;">${value}</td>
                    </tr>`
        : '';
    return `
      <div style="margin: 0; padding: 0; background-color: ${BRAND.surface}; font-family: 'Helvetica', Arial, sans-serif; width: 100%;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${BRAND.surface}; padding: 40px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                ${bannerRow(bannerSrc)}
                <tr>
                  <td style="padding: 34px 30px 40px;">
                    <div style="text-align: center; margin-bottom: 22px;">
                      <h2 style="color: ${BRAND.dark}; margin: 0; font-size: 20px; font-weight: 700;">Nuevo negocio interesado</h2>
                    </div>
                    <p style="color: ${BRAND.muted}; font-size: 14px; line-height: 20px; margin-bottom: 20px;">
                      Alguien llenó el formulario "¿Tienes un negocio?" desde la app. Estos son sus datos:
                    </p>
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-top: 1px solid ${BRAND.surface};">
                      ${row('Negocio', lead.businessName)}
                      ${row('Titular / representante', lead.ownerName)}
                      ${row('Tipo de negocio', lead.businessType)}
                      ${row('Municipio y dirección', lead.municipalityAddress)}
                      ${row('Teléfono', lead.phone)}
                      ${row('Correo de contacto', lead.contactEmail)}
                      ${row('NIT / cédula', lead.identificationNumber)}
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: ${BRAND.dark}; padding: 18px 30px; text-align: center;">
                    <p style="color: #ffffff; font-size: 12px; margin: 0;">© ${BRAND.name} — ${BRAND.slogan}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `;
  }

  /**
   * Página HTML que ve el usuario al abrir el enlace de "eliminar mi cuenta"
   * (mismo patrón que `verifyEmailResultPage` — ver esa nota, aplica igual).
   */
  deletionResultPage(success: boolean, message: string) {
    const icon = success ? '✓' : '✕';
    const iconBg = success ? '#22C55E' : '#EF4444';
    const title = success ? 'Cuenta eliminada' : 'No se pudo eliminar tu cuenta';
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — ${BRAND.name}</title>
</head>
<body style="margin: 0; background-color: ${BRAND.surface}; font-family: 'Helvetica', Arial, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh;">
  <div style="background: #ffffff; border-radius: 20px; overflow: hidden; max-width: 380px; width: 90%; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
    <img src="${BANNER_DATA_URI}" alt="${BRAND.name}" style="display: block; width: 100%; height: auto; border: 0;" />
    <div style="padding: 30px 30px 36px; text-align: center;">
      <div style="width: 70px; height: 70px; border-radius: 50%; background: ${iconBg}; color: #fff; font-size: 36px; line-height: 70px; margin: 0 auto 20px;">${icon}</div>
      <h2 style="color: ${BRAND.dark}; margin: 0 0 10px; font-size: 20px;">${title}</h2>
      <p style="color: ${BRAND.muted}; font-size: 15px; line-height: 22px; margin: 0;">${message}</p>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Correo de bienvenida de la alta masiva del admin (subida de CSV/lista de
   * correos, ver `UserService.bulkInvite`). Se manda UNO POR CUENTA (nunca
   * varios destinatarios en el mismo correo, para que nadie vea la
   * contraseña de los demás) con la contraseña fija del rol y las
   * instrucciones de uso propias de ese rol.
   */
  bulkInviteWelcomeTemplate(
    fullName: string,
    email: string,
    password: string,
    roleTypeCode: RoleTypeCode,
    bannerSrc: string = `cid:${MANDALO_BANNER_CID}`,
  ) {
    const copy: Record<
      string,
      { roleLabel: string; intro: string; steps: string[] }
    > = {
      [RoleTypeCode.CLIENT]: {
        roleLabel: 'Cliente',
        intro:
          'Con Mandalo puedes pedir comida y productos de negocios de Mocoa y el Putumayo, y ver tu domicilio llegar hasta tu puerta en tiempo real.',
        steps: [
          'Explora los negocios cerca de ti y arma tu pedido.',
          'Sigue tu domicilio en el mapa, en vivo, desde que sale hasta que llega.',
          'Escríbele por el chat a tu domiciliario si necesitas darle alguna indicación.',
          'Consulta tu historial en "Mis pedidos" y vuelve a pedir en un toque.',
        ],
      },
      [RoleTypeCode.BUSINESS]: {
        roleLabel: 'Negocio',
        intro:
          'Con Mandalo tu negocio recibe pedidos de clientes de Mocoa y el Putumayo, y cuenta con domiciliarios propios para las entregas.',
        steps: [
          'Agrega o actualiza tus productos, fotos y precios cuando quieras.',
          'Recibe y confirma los pedidos nuevos en tiempo real.',
          'Usa el chat para coordinar con el cliente o el domiciliario.',
          'Revisa tus pagos y liquidaciones desde "Mis pagos".',
        ],
      },
      [RoleTypeCode.DELIVERY]: {
        roleLabel: 'Domiciliario',
        intro:
          'Con Mandalo puedes tomar domicilios disponibles en Mocoa y el Putumayo y ganar por cada entrega que hagas.',
        steps: [
          'Activa tu disponibilidad para ver los domicilios cerca de ti.',
          'Toma un pedido, síguelo hasta el negocio y luego hasta el cliente.',
          'Marca "En sitio" al llegar y usa el chat si necesitas avisar algo.',
          'Consulta tus cobros y liquidaciones desde "Mis cobros".',
        ],
      },
    };
    const { roleLabel, intro, steps } = copy[roleTypeCode] ?? copy[RoleTypeCode.CLIENT];
    const stepsHtml = steps
      .map(
        (step) => `
                      <tr>
                        <td style="padding: 6px 0; color: ${BRAND.muted}; font-size: 14px; line-height: 20px; vertical-align: top;">
                          <span style="color: ${BRAND.primary}; font-weight: 800;">•</span>&nbsp; ${step}
                        </td>
                      </tr>`,
      )
      .join('');

    return `
      <div style="margin: 0; padding: 0; background-color: ${BRAND.surface}; font-family: 'Helvetica', Arial, sans-serif; width: 100%;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${BRAND.surface}; padding: 40px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                ${bannerRow(bannerSrc)}
                <tr>
                  <td style="padding: 34px 30px 40px;">
                    <div style="text-align: center; margin-bottom: 26px;">
                      <h2 style="color: ${BRAND.dark}; margin: 0; font-size: 20px; font-weight: 700;">¡Tu cuenta de ${roleLabel} ya está lista!</h2>
                    </div>
                    <p style="color: ${BRAND.muted}; font-size: 16px; line-height: 24px; margin-bottom: 20px;">
                      ¡Hola <strong style="color: ${BRAND.dark};">${fullName || ''}</strong>!
                    </p>
                    <p style="color: ${BRAND.muted}; font-size: 16px; line-height: 24px; margin-bottom: 25px;">
                      Creamos tu cuenta en <strong style="color: ${BRAND.dark};">${BRAND.name}</strong> con rol de <strong style="color: ${BRAND.dark};">${roleLabel}</strong>. ${intro}
                    </p>

                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background: ${BRAND.surface}; border-radius: 14px; margin-bottom: 25px;">
                      <tr>
                        <td style="padding: 20px 22px;">
                          <p style="margin: 0 0 4px; color: ${BRAND.muted}; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">Correo</p>
                          <p style="margin: 0 0 14px; color: ${BRAND.dark}; font-size: 16px; font-weight: 700; word-break: break-all;">${email}</p>
                          <p style="margin: 0 0 4px; color: ${BRAND.muted}; font-size: 11px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;">Contraseña</p>
                          <p style="margin: 0; color: ${BRAND.dark}; font-size: 20px; font-weight: 800; letter-spacing: 1px;">${password}</p>
                        </td>
                      </tr>
                    </table>

                    <p style="color: ${BRAND.muted}; font-size: 14px; line-height: 21px; margin-bottom: 25px;">
                      ⚠️ Por seguridad, te recomendamos <strong style="color: ${BRAND.dark};">cambiar esta contraseña apenas inicies sesión</strong>: puedes hacerlo desde "¿Olvidaste tu contraseña?" en la pantalla de inicio de sesión, o desde "Cambiar contraseña" dentro de tu perfil ("Mi cuenta").
                    </p>

                    <p style="color: ${BRAND.dark}; font-size: 15px; font-weight: 700; margin-bottom: 6px;">¿Qué puedes hacer en la app?</p>
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 25px;">
                      ${stepsHtml}
                    </table>

                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background: #FFF3EE; border-radius: 14px; margin-bottom: 10px;">
                      <tr>
                        <td style="padding: 18px 22px;">
                          <p style="margin: 0; color: ${BRAND.dark}; font-size: 14px; line-height: 21px;">
                            🙏 Te pedimos el favor de <strong>usar la app durante los próximos 12 días como mínimo</strong>, idealmente <strong>2 veces al día</strong> (una en la mañana y otra en la tarde) — nos ayuda muchísimo a seguir mejorando el servicio antes de nuestro lanzamiento oficial. ¡Gracias por ser parte de esto!
                          </p>
                        </td>
                      </tr>
                    </table>

                    <p style="color: ${BRAND.muted}; font-size: 12px; line-height: 19px; margin: 20px 0 0;">
                      Es posible que también te llegue (o ya te haya llegado) un correo de <strong>Google Play</strong> invitándote a ser tester de Mandalo — es parte de la misma prueba: acepta esa invitación para poder instalar o actualizar la app desde ahí.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: ${BRAND.dark}; padding: 18px 30px; text-align: center;">
                    <p style="color: #ffffff; font-size: 12px; margin: 0;">© ${BRAND.name} — ${BRAND.slogan}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>
    `;
  }
}
