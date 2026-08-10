import { MailerService } from '@nestjs-modules/mailer';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SendEmailOptions } from '../interfaces/mail.interface';

@Injectable()
export class MailsService {
  constructor(
    private readonly _mailerService: MailerService,
    private readonly _configService: ConfigService,
  ) {}

  async sendEmail({
    from,
    to,
    subject,
    body,
    replyTo,
    attachments,
  }: SendEmailOptions): Promise<void> {
    if (!to) {
      throw new HttpException(
        'No recipient email provided',
        HttpStatus.BAD_REQUEST,
      );
    }
    return await this._mailerService.sendMail({
      from: from || this._configService.get<string>('mail.sender'),
      to,
      subject,
      html: body,
      text: htmlToPlainText(body),
      replyTo,
      attachments,
    });
  }
}

/**
 * Los filtros de spam penalizan los correos que solo traen `html` sin una
 * versión de texto plano (`multipart/alternative` es la señal esperada) —
 * no hace falta una conversión perfecta, solo que exista.
 */
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
