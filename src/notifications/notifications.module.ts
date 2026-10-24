import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { NotificationPublisher } from './application/notification-publisher';
import {
  CountUnreadNotificationsUseCase,
  ListNotificationsUseCase,
  MarkAllNotificationsReadUseCase,
  MarkNotificationReadUseCase,
} from './application/use-cases/notifications.use-cases';
import { RunRemindersUseCase } from './application/use-cases/run-reminders.use-case';
import { NOTIFICATIONS_REPOSITORY } from './domain/notifications.repository';
import { REMINDERS_READER } from './domain/reminders.reader';
import { DrizzleNotificationsRepository } from './infrastructure/drizzle/drizzle-notifications.repository';
import { DrizzleRemindersReader } from './infrastructure/drizzle/drizzle-reminders.reader';
import { RemindersScheduler } from './infrastructure/scheduler/reminders.scheduler';
import { NotificationsController } from './presentation/controllers/notifications.controller';

// Notificaciones y recordatorios automáticos. Otros módulos importan este
// módulo y usan NotificationPublisher; este módulo no importa a ninguno de
// ellos (lee follow_ups y quotes directamente), así que no hay ciclos.
@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [NotificationsController],
  providers: [
    {
      provide: NOTIFICATIONS_REPOSITORY,
      useClass: DrizzleNotificationsRepository,
    },
    { provide: REMINDERS_READER, useClass: DrizzleRemindersReader },
    NotificationPublisher,
    ListNotificationsUseCase,
    CountUnreadNotificationsUseCase,
    MarkNotificationReadUseCase,
    MarkAllNotificationsReadUseCase,
    RunRemindersUseCase,
    RemindersScheduler,
  ],
  exports: [NotificationPublisher, RunRemindersUseCase],
})
export class NotificationsModule {}
