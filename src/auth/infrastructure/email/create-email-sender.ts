import type { ConfigService } from '@nestjs/config';
import type { EmailSender } from '../../application/ports/email-sender';
import { ConsoleEmailSender } from './console-email-sender';
import { ResendEmailSender } from './resend-email-sender';

// Selección del transporte de correo según la configuración:
//  - Con RESEND_API_KEY + EMAIL_FROM → Resend (producción o desarrollo).
//  - Sin credenciales en producción → error explícito de configuración:
//    la app no debe arrancar sin poder enviar los correos de recuperación.
//  - Sin credenciales fuera de producción → fallback a consola (DEV).
export function createEmailSender(config: ConfigService): EmailSender {
  const apiKey = config.get<string>('RESEND_API_KEY');
  const from = config.get<string>('EMAIL_FROM');

  if (apiKey && from) {
    return new ResendEmailSender(apiKey, from);
  }

  if (config.get<string>('NODE_ENV') === 'production') {
    throw new Error(
      'Invalid email configuration: RESEND_API_KEY and EMAIL_FROM are required in production',
    );
  }

  return new ConsoleEmailSender();
}
