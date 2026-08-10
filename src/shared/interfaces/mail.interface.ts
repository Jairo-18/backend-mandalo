/** Adjunto embebido por CID (imagen referenciada como `cid:xxx` en el HTML). */
export interface MailAttachment {
  filename: string;
  content: Buffer;
  cid: string;
}

export interface SendEmailOptions {
  from?: string;
  to: string;
  subject: string;
  body: string;
  /** Para que responder el correo vaya directo a quien escribió, no a `from`. */
  replyTo?: string;
  /** Imágenes embebidas (p. ej. el banner de marca) — ver `MailAttachment`. */
  attachments?: MailAttachment[];
}
