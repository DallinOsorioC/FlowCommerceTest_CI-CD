import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { LeadsModule } from '../leads/leads.module';
import { ProjectsModule } from '../projects/projects.module';
import {
  CreateFollowUpUseCase,
  DeleteFollowUpUseCase,
  GetFollowUpUseCase,
  ListFollowUpsUseCase,
  UpdateFollowUpUseCase,
} from './application/use-cases/follow-ups.use-cases';
import { FOLLOW_UPS_REPOSITORY } from './domain/repositories/follow-up.repository';
import { DrizzleFollowUpRepository } from './infrastructure/drizzle/drizzle-follow-up.repository';
import { FollowUpsController } from './presentation/controllers/follow-ups.controller';

// Seguimientos comerciales de los leads. Los recordatorios cuando vencen los
// genera NotificationsModule (scheduler), que lee la tabla follow_ups.
@Module({
  imports: [
    AuthModule,
    AuthorizationModule,
    LeadsModule,
    ProjectsModule,
    ActivityModule,
  ],
  controllers: [FollowUpsController],
  providers: [
    { provide: FOLLOW_UPS_REPOSITORY, useClass: DrizzleFollowUpRepository },
    CreateFollowUpUseCase,
    ListFollowUpsUseCase,
    GetFollowUpUseCase,
    UpdateFollowUpUseCase,
    DeleteFollowUpUseCase,
  ],
})
export class FollowUpsModule {}
