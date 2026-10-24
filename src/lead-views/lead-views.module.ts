import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { LeadViewsUseCases } from './application/lead-views.use-cases';
import { LEAD_VIEWS_REPOSITORY } from './domain/lead-view';
import { DrizzleLeadViewsRepository } from './infrastructure/drizzle/drizzle-lead-views.repository';
import { LeadViewsController } from './presentation/lead-views.controller';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [LeadViewsController],
  providers: [
    { provide: LEAD_VIEWS_REPOSITORY, useClass: DrizzleLeadViewsRepository },
    LeadViewsUseCases,
  ],
})
export class LeadViewsModule {}
