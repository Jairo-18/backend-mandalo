export interface SendEmailOptions {
  from?: string;
  to: string;
  subject: string;
  body: string;
  /** Para que responder el correo vaya directo a quien escribió, no a `from`. */
  replyTo?: string;
}
