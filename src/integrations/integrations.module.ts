import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ClientsModule } from '../clients/clients.module';
import { LeadsModule } from '../leads/leads.module';
import { MessagesModule } from '../messages/messages.module';
import { ProductsModule } from '../products/products.module';
import { ProjectsModule } from '../projects/projects.module';
import { QuotesModule } from '../quotes/quotes.module';
import {
  GetLeadContextForAiUseCase,
  ListCatalogForAiUseCase,
} from './application/ai-context.use-case';
import {
  CreateApiKeyUseCase,
  ListApiKeysUseCase,
  RevokeApiKeyUseCase,
} from './application/api-keys.use-cases';
import {
  CreatePaymentLinkUseCase,
  HandlePaymentWebhookUseCase,
} from './application/payments.use-cases';
import { API_KEYS_REPOSITORY } from './domain/api-key';
import { PAYMENT_EVENTS_REPOSITORY, PAYMENTS_GATEWAY } from './domain/payments';
import { DrizzleApiKeysRepository } from './infrastructure/drizzle/drizzle-api-keys.repository';
import { DrizzlePaymentEventsRepository } from './infrastructure/drizzle/drizzle-payment-events.repository';
import { HttpPaymentsGateway } from './infrastructure/payments/http-payments.gateway';
import { AiIntegrationController } from './presentation/controllers/ai-integration.controller';
import { ApiKeysController } from './presentation/controllers/api-keys.controller';
import {
  PaymentLinkController,
  PaymentsWebhookController,
} from './presentation/controllers/payments.controller';
import { ApiKeyGuard } from './presentation/guards/api-key.guard';

// Integraciones con los otros equipos del curso:
//   - IA: API keys por proyecto y endpoints /integrations/ai/*.
//   - Pagos: link de pago de una cotización y webhook de pago confirmado.
// El contrato completo está en docs (contrato-ia-pagos).
@Module({
  imports: [
    AuthModule,
    AuthorizationModule,
    ActivityModule,
    ProjectsModule,
    LeadsModule,
    ClientsModule,
    ProductsModule,
    QuotesModule,
    MessagesModule,
  ],
  controllers: [
    ApiKeysController,
    AiIntegrationController,
    PaymentLinkController,
    PaymentsWebhookController,
  ],
  providers: [
    { provide: API_KEYS_REPOSITORY, useClass: DrizzleApiKeysRepository },
    {
      provide: PAYMENT_EVENTS_REPOSITORY,
      useClass: DrizzlePaymentEventsRepository,
    },
    { provide: PAYMENTS_GATEWAY, useClass: HttpPaymentsGateway },
    ApiKeyGuard,
    CreateApiKeyUseCase,
    ListApiKeysUseCase,
    RevokeApiKeyUseCase,
    GetLeadContextForAiUseCase,
    ListCatalogForAiUseCase,
    CreatePaymentLinkUseCase,
    HandlePaymentWebhookUseCase,
  ],
})
export class IntegrationsModule {}
