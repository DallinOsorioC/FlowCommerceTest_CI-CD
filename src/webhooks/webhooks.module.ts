import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ACTIVITY_SINK } from '../activity/domain/activity';
import { ActivityWebhookBridge } from './application/activity-webhook-bridge';
import { WebhookDispatcher } from './application/webhook-dispatcher';
import { WebhooksUseCases } from './application/webhooks.use-cases';
import { WEBHOOKS_REPOSITORY } from './domain/webhook';
import { DrizzleWebhooksRepository } from './infrastructure/drizzle/drizzle-webhooks.repository';
import { WebhooksController } from './presentation/webhooks.controller';

// Webhooks salientes. Es global porque ActivityRecorder (que usan casi todos
// los módulos) recibe ACTIVITY_SINK de aquí: así cada evento de actividad se
// notifica sin que ningún módulo de negocio dependa de los webhooks. Este
// módulo no importa ActivityModule, por eso no hay ciclo.
@Global()
@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [WebhooksController],
  providers: [
    { provide: WEBHOOKS_REPOSITORY, useClass: DrizzleWebhooksRepository },
    WebhookDispatcher,
    WebhooksUseCases,
    ActivityWebhookBridge,
    { provide: ACTIVITY_SINK, useExisting: ActivityWebhookBridge },
  ],
  exports: [ACTIVITY_SINK, WebhookDispatcher],
})
export class WebhooksModule {}
