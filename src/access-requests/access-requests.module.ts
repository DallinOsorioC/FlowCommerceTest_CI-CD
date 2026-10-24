import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import { ApproveAccessRequestUseCase } from './application/use-cases/approve-access-request.use-case';
import { CreateAccessRequestUseCase } from './application/use-cases/create-access-request.use-case';
import { ListAccessRequestsUseCase } from './application/use-cases/list-access-requests.use-case';
import { RejectAccessRequestUseCase } from './application/use-cases/reject-access-request.use-case';
import { ACCESS_REQUEST_REPOSITORY } from './domain/repositories/access-request.repository';
import { DrizzleAccessRequestRepository } from './infrastructure/drizzle/drizzle-access-request.repository';
import { AccessRequestsController } from './presentation/controllers/access-requests.controller';
import { PublicAccessRequestController } from './presentation/controllers/public-access-request.controller';

@Module({
  imports: [
    AuthModule,
    AuthorizationModule,
    ProjectsModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [AccessRequestsController, PublicAccessRequestController],
  providers: [
    {
      provide: ACCESS_REQUEST_REPOSITORY,
      useClass: DrizzleAccessRequestRepository,
    },
    CreateAccessRequestUseCase,
    ListAccessRequestsUseCase,
    ApproveAccessRequestUseCase,
    RejectAccessRequestUseCase,
  ],
  exports: [ACCESS_REQUEST_REPOSITORY],
})
export class AccessRequestsModule {}
