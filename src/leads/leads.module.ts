import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { CreateLeadUseCase } from './application/use-cases/create-lead.use-case';
import { DeleteLeadUseCase } from './application/use-cases/delete-lead.use-case';
import { GetLeadUseCase } from './application/use-cases/get-lead.use-case';
import { ListLeadsUseCase } from './application/use-cases/list-leads.use-case';
import { UpdateLeadUseCase } from './application/use-cases/update-lead.use-case';
import { LEAD_REFERENCES_READER } from './domain/repositories/lead-references.reader';
import { LEADS_REPOSITORY } from './domain/repositories/lead.repository';
import { DrizzleLeadReferencesReader } from './infrastructure/drizzle/drizzle-lead-references.reader';
import { DrizzleLeadRepository } from './infrastructure/drizzle/drizzle-lead.repository';
import { LeadsController } from './presentation/controllers/leads.controller';

@Module({
  imports: [
    AuthModule,
    AuthorizationModule,
    ProjectsModule,
    NotificationsModule,
    ActivityModule,
  ],
  controllers: [LeadsController],
  providers: [
    {
      provide: LEADS_REPOSITORY,
      useClass: DrizzleLeadRepository,
    },
    {
      provide: LEAD_REFERENCES_READER,
      useClass: DrizzleLeadReferencesReader,
    },
    CreateLeadUseCase,
    ListLeadsUseCase,
    GetLeadUseCase,
    UpdateLeadUseCase,
    DeleteLeadUseCase,
  ],
  // CreateLeadUseCase lo reutiliza la integración de IA (mismas reglas).
  exports: [LEADS_REPOSITORY, CreateLeadUseCase],
})
export class LeadsModule {}
