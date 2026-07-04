import { Injectable } from '@nestjs/common';

const BRAND = {
  name: 'Mándalo',
  slogan: 'LO PIDES, LO LLEVAMOS.',
  primary: '#FF5A3C',
  dark: '#1E1E2D',
  muted: '#7A7A8A',
  surface: '#F2F2F2',
};

/**
 * Plantillas HTML de los correos transaccionales y de las páginas que sirve
 * el backend (p. ej. el resultado de la verificación de correo), con la
 * identidad de marca de Mándalo.
 */
@Injectable()
export class MailTemplateService {
  verifyEmailTemplate(verifyLink: string, fullName: string) {
    return `
      <div style="margin: 0; padding: 0; background-color: ${BRAND.surface}; font-family: 'Helvetica', Arial, sans-serif; width: 100%;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${BRAND.surface}; padding: 40px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background-color: ${BRAND.primary}; height: 6px;"></td>
                </tr>
                <tr>
                  <td style="padding: 40px 30px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                      <h1 style="color: ${BRAND.primary}; margin: 0; font-size: 30px; font-weight: 800;">${BRAND.name}</h1>
                      <p style="color: ${BRAND.muted}; margin: 4px 0 0; font-size: 11px; letter-spacing: 2px; font-weight: 700;">${BRAND.slogan}</p>
                      <h2 style="color: ${BRAND.dark}; margin: 25px 0 0; font-size: 20px; font-weight: 700;">Verifica tu correo electrónico</h2>
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
                    <p style="color: ${BRAND.muted}; font-size: 13px; line-height: 20px; margin-bottom: 8px;">
                      El enlace vence en <strong>30 minutos</strong>. Si no fuiste tú quien se registró, ignora este correo.
                    </p>
                    <p style="color: ${BRAND.muted}; font-size: 12px; line-height: 18px; word-break: break-all; margin-top: 20px;">
                      ¿El botón no funciona? Copia y pega este enlace en tu navegador:<br/>
                      <a href="${verifyLink}" style="color: ${BRAND.primary};">${verifyLink}</a>
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
   */
  resetPasswordTemplate(code: string, fullName: string) {
    return `
      <div style="margin: 0; padding: 0; background-color: ${BRAND.surface}; font-family: 'Helvetica', Arial, sans-serif; width: 100%;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${BRAND.surface}; padding: 40px 10px;">
          <tr>
            <td align="center">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 500px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <tr>
                  <td style="background-color: ${BRAND.primary}; height: 6px;"></td>
                </tr>
                <tr>
                  <td style="padding: 40px 30px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                      <h1 style="color: ${BRAND.primary}; margin: 0; font-size: 30px; font-weight: 800;">${BRAND.name}</h1>
                      <p style="color: ${BRAND.muted}; margin: 4px 0 0; font-size: 11px; letter-spacing: 2px; font-weight: 700;">${BRAND.slogan}</p>
                      <h2 style="color: ${BRAND.dark}; margin: 25px 0 0; font-size: 20px; font-weight: 700;">Restablece tu contraseña</h2>
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
                    <p style="color: ${BRAND.muted}; font-size: 13px; line-height: 20px; margin-bottom: 8px;">
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
  <div style="background: #ffffff; border-radius: 20px; padding: 40px 30px; max-width: 380px; width: 90%; text-align: center; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border-top: 6px solid ${BRAND.primary};">
    <h1 style="color: ${BRAND.primary}; margin: 0; font-size: 30px; font-weight: 800;">${BRAND.name}</h1>
    <p style="color: ${BRAND.muted}; margin: 4px 0 0; font-size: 10px; letter-spacing: 2px; font-weight: 700;">${BRAND.slogan}</p>
    <div style="width: 70px; height: 70px; border-radius: 50%; background: ${iconBg}; color: #fff; font-size: 36px; line-height: 70px; margin: 30px auto 20px;">${icon}</div>
    <h2 style="color: ${BRAND.dark}; margin: 0 0 10px; font-size: 20px;">${title}</h2>
    <p style="color: ${BRAND.muted}; font-size: 15px; line-height: 22px; margin: 0;">${message}</p>
  </div>
</body>
</html>`;
  }
}
