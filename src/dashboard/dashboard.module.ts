import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { GetDashboardUseCase } from './application/use-cases/get-dashboard.use-case';
import { DASHBOARD_REPOSITORY } from './domain/repositories/dashboard.repository';
import { DrizzleDashboardRepository } from './infrastructure/drizzle/drizzle-dashboard.repository';
import { DashboardController } from './presentation/controllers/dashboard.controller';

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [DashboardController],
  providers: [
    {
      provide: DASHBOARD_REPOSITORY,
      useClass: DrizzleDashboardRepository,
    },
    GetDashboardUseCase,
  ],
})
export class DashboardModule {}
