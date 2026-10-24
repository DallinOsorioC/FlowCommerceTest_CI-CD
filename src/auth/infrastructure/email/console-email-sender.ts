import { Injectable, Logger } from '@nestjs/common';
import type {
  EmailMessage,
  EmailSender,
} from '../../application/ports/email-sender';

// Transporte de desarrollo: imprime el correo en los logs en lugar de
// enviarlo. Sólo se usa como fallback cuando no hay proveedor configurado
// y NODE_ENV no es producción (ver create-email-sender.ts).
@Injectable()
export class ConsoleEmailSender implements EmailSender {
  private readonly logger = new Logger(ConsoleEmailSender.name);

  send(message: EmailMessage): Promise<void> {
    this.logger.log(
      [
        'Email (console fallback, no enviado):',
        `  to: ${message.to}`,
        `  subject: ${message.subject}`,
        ...(message.attachments ?? []).map(
          (file) =>
            `  attachment: ${file.filename} (${file.contentType}, ${file.content.length} bytes)`,
        ),
        `  text:`,
        message.text,
      ].join('\n'),
    );
    return Promise.resolve();
  }
}
