import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ActivityRecorder } from './application/activity-recorder';
import { ListActivityUseCase } from './application/use-cases/list-activity.use-case';
import { ACTIVITY_REPOSITORY } from './domain/activity';
import { DrizzleActivityRepository } from './infrastructure/drizzle/drizzle-activity.repository';
import { ActivityController } from './presentation/controllers/activity.controller';

// Historial de actividad. Otros módulos lo importan y usan ActivityRecorder;
// este módulo no importa a ninguno de ellos, así que no hay ciclos.
@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [ActivityController],
  providers: [
    { provide: ACTIVITY_REPOSITORY, useClass: DrizzleActivityRepository },
    ActivityRecorder,
    ListActivityUseCase,
  ],
  exports: [ActivityRecorder],
})
export class ActivityModule {}
