import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ProjectsModule } from '../projects/projects.module';
import { UsersModule } from '../users/users.module';
import {
  AcceptInvitationUseCase,
  InviteMemberUseCase,
  ListInvitationsUseCase,
  PreviewInvitationUseCase,
  RevokeInvitationUseCase,
} from './application/invitations.use-cases';
import { INVITATIONS_REPOSITORY } from './domain/invitations.repository';
import { DrizzleInvitationsRepository } from './infrastructure/drizzle/drizzle-invitations.repository';
import {
  ProjectInvitationsController,
  PublicInvitationsController,
} from './presentation/invitations.controller';

@Module({
  imports: [AuthModule, AuthorizationModule, ProjectsModule, UsersModule],
  controllers: [ProjectInvitationsController, PublicInvitationsController],
  providers: [
    { provide: INVITATIONS_REPOSITORY, useClass: DrizzleInvitationsRepository },
    InviteMemberUseCase,
    ListInvitationsUseCase,
    RevokeInvitationUseCase,
    PreviewInvitationUseCase,
    AcceptInvitationUseCase,
  ],
})
export class InvitationsModule {}
