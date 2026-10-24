import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { EMAIL_SENDER } from './application/ports/email-sender';
import { IDENTITY_ADMIN } from './application/ports/identity-admin';
import { SESSION_MANAGER } from './application/ports/session-manager';
import { createEmailSender } from './infrastructure/email/create-email-sender';
import { SupabaseIdentityAdmin } from './infrastructure/supabase/supabase-identity.admin';
import { SupabaseJwtVerifier } from './infrastructure/supabase/supabase-jwt.verifier';
import { SupabaseSessionManager } from './infrastructure/supabase/supabase-session.manager';
import { SessionController } from './presentation/controllers/session.controller';
import { AuthenticatedGuard } from './presentation/guards/authenticated.guard';

@Module({
  imports: [UsersModule],
  controllers: [SessionController],
  providers: [
    // Transporte de correo: Resend con RESEND_API_KEY/EMAIL_FROM; en
    // producción sin esas variables falla aquí, de forma explícita, y la
    // app no arranca (ver create-email-sender.ts). Lo usan las cotizaciones y
    // las invitaciones; los correos de acceso los envía Supabase Auth.
    {
      provide: EMAIL_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createEmailSender(config),
    },
    // Sesión = access token de Supabase Auth (JWT en Authorization: Bearer).
    {
      provide: SupabaseJwtVerifier,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new SupabaseJwtVerifier(config),
    },
    { provide: SESSION_MANAGER, useClass: SupabaseSessionManager },
    {
      provide: IDENTITY_ADMIN,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => new SupabaseIdentityAdmin(config),
    },
    AuthenticatedGuard,
  ],
  exports: [
    // El transporte de correo lo reutilizan Quotes (envío de cotizaciones) y
    // Projects (invitaciones).
    EMAIL_SENDER,
    SESSION_MANAGER,
    IDENTITY_ADMIN,
    AuthenticatedGuard,
  ],
})
export class AuthModule {}
