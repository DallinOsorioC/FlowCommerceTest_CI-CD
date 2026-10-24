import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { isThrottleDisabled } from './common/config/throttle';
import { AccessRequestsModule } from './access-requests/access-requests.module';
import { ActivityModule } from './activity/activity.module';
import { AuthModule } from './auth/auth.module';
import { AuthorizationModule } from './authorization/authorization.module';
import { ClientsModule } from './clients/clients.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './db/database.module';
import { FilesModule } from './files/files.module';
import { FollowUpsModule } from './follow-ups/follow-ups.module';
import { HealthModule } from './health/health.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { InvitationsModule } from './invitations/invitations.module';
import { LeadViewsModule } from './lead-views/lead-views.module';
import { LeadsModule } from './leads/leads.module';
import { MessagesModule } from './messages/messages.module';
import { NotificationsModule } from './notifications/notifications.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { ProductsModule } from './products/products.module';
import { ProjectsModule } from './projects/projects.module';
import { QuickRepliesModule } from './quick-replies/quick-replies.module';
import { QuotesModule } from './quotes/quotes.module';
import { SearchModule } from './search/search.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { UserProfileModule } from './users/user-profile.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    // Límite por IP. Solo actúa donde se pone @UseGuards(ThrottlerGuard): los
    // endpoints públicos de auth. Cada ruta fija su propio límite con
    // @Throttle (ver common/config/throttle.ts); este es el valor por defecto.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 60 }],
      skipIf: () => isThrottleDisabled(),
    }),
    // Tareas programadas (recordatorios de seguimientos y cotizaciones
    // vencidas). Ver notifications/infrastructure/scheduler.
    ScheduleModule.forRoot(),
    CryptoModule,
    DatabaseModule,
    UsersModule,
    UserProfileModule,
    AuthModule,
    AccessRequestsModule,
    ProjectsModule,
    AuthorizationModule,
    LeadsModule,
    MessagesModule,
    QuickRepliesModule,
    LeadViewsModule,
    WebhooksModule,
    QuotesModule,
    ProductsModule,
    ClientsModule,
    DashboardModule,
    NotificationsModule,
    FollowUpsModule,
    SearchModule,
    InvitationsModule,
    ActivityModule,
    FilesModule,
    IntegrationsModule,
    HealthModule,
  ],
})
export class AppModule {}
