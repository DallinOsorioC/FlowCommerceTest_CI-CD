import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { FilesModule } from '../files/files.module';
import { LeadsModule } from '../leads/leads.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GetUnreadCountUseCase } from './application/use-cases/get-unread-count.use-case';
import { HandleWhatsAppWebhookUseCase } from './application/use-cases/handle-whatsapp-webhook.use-case';
import { ListConversationsUseCase } from './application/use-cases/list-conversations.use-case';
import { ListLeadMessagesUseCase } from './application/use-cases/list-lead-messages.use-case';
import { MarkConversationReadUseCase } from './application/use-cases/mark-conversation-read.use-case';
import { SendMediaMessageUseCase } from './application/use-cases/send-media-message.use-case';
import { SendMessageUseCase } from './application/use-cases/send-message.use-case';
import {
  DeleteWhatsAppConfigUseCase,
  GetWhatsAppConfigUseCase,
  SaveWhatsAppConfigUseCase,
} from './application/use-cases/whatsapp-config.use-cases';
import {
  ListWhatsAppTemplatesUseCase,
  ManageWhatsAppTemplatesUseCase,
  SendTemplateMessageUseCase,
} from './application/use-cases/whatsapp-templates.use-cases';
import { MESSAGES_REPOSITORY } from './domain/ports/messages.repository';
import { WHATSAPP_ACCOUNTS_REPOSITORY } from './domain/ports/whatsapp-accounts.repository';
import { WHATSAPP_GATEWAY } from './domain/ports/whatsapp.gateway';
import { DrizzleMessagesRepository } from './infrastructure/drizzle/drizzle-messages.repository';
import { DrizzleWhatsAppAccountsRepository } from './infrastructure/drizzle/drizzle-whatsapp-accounts.repository';
import { CloudWhatsAppGateway } from './infrastructure/whatsapp/cloud-whatsapp.gateway';
import { WhatsAppCredentialsResolver } from './infrastructure/whatsapp/whatsapp-credentials.resolver';
import { ConversationsController } from './presentation/controllers/conversations.controller';
import { MessagesController } from './presentation/controllers/messages.controller';
import { WhatsAppConfigController } from './presentation/controllers/whatsapp-config.controller';
import { WhatsAppTemplatesController } from './presentation/controllers/whatsapp-templates.controller';
import { WhatsAppWebhookController } from './presentation/controllers/whatsapp-webhook.controller';

@Module({
  // LeadsModule se importa para reutilizar su LEADS_REPOSITORY: enviar un
  // mensaje exige comprobar que el lead pertenece al proyecto y resolver su
  // teléfono, y el webhook casa el `from` con un lead del tenant.
  // FilesModule: archivos enviados y recibidos por WhatsApp.
  imports: [
    AuthModule,
    AuthorizationModule,
    LeadsModule,
    NotificationsModule,
    ActivityModule,
    FilesModule,
  ],
  controllers: [
    ConversationsController,
    MessagesController,
    WhatsAppWebhookController,
    WhatsAppTemplatesController,
    WhatsAppConfigController,
  ],
  providers: [
    {
      provide: MESSAGES_REPOSITORY,
      useClass: DrizzleMessagesRepository,
    },
    {
      provide: WHATSAPP_ACCOUNTS_REPOSITORY,
      useClass: DrizzleWhatsAppAccountsRepository,
    },
    WhatsAppCredentialsResolver,
    {
      provide: WHATSAPP_GATEWAY,
      useClass: CloudWhatsAppGateway,
    },
    SendMessageUseCase,
    HandleWhatsAppWebhookUseCase,
    ListConversationsUseCase,
    GetUnreadCountUseCase,
    ListLeadMessagesUseCase,
    MarkConversationReadUseCase,
    ListWhatsAppTemplatesUseCase,
    SendTemplateMessageUseCase,
    SendMediaMessageUseCase,
    ManageWhatsAppTemplatesUseCase,
    GetWhatsAppConfigUseCase,
    SaveWhatsAppConfigUseCase,
    DeleteWhatsAppConfigUseCase,
  ],
  exports: [MESSAGES_REPOSITORY],
})
export class MessagesModule {}
