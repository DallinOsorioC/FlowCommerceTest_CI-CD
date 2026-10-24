import { Injectable } from '@nestjs/common';
import type {
  EmailMessage,
  EmailSender,
} from '../../application/ports/email-sender';

const RESEND_API_URL = 'https://api.resend.com/emails';

// Transporte de producción contra la API de Resend por HTTPS (fetch nativo,
// sin dependencias adicionales). Las credenciales llegan por env y se
// validan en la fábrica: en producción sin RESEND_API_KEY/EMAIL_FROM la
// aplicación no arranca.
@Injectable()
export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        ...(message.cc && message.cc.length > 0 ? { cc: message.cc } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
        subject: message.subject,
        text: message.text,
        html: message.html,
        // Resend recibe los adjuntos en base64.
        ...(message.attachments && message.attachments.length > 0
          ? {
              attachments: message.attachments.map((file) => ({
                filename: file.filename,
                content: file.content.toString('base64'),
                content_type: file.contentType,
              })),
            }
          : {}),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Resend API error ${response.status}: ${detail || response.statusText}`,
      );
    }
  }
}
