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

  async sendEmail({ from, to, subject, body }: SendEmailOptions): Promise<void> {
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
    });
  }
}
