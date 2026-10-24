import { forwardRef, Module } from '@nestjs/common';
import { ProjectsModule } from '../projects/projects.module';
import { AuthorizationService } from './application/services/authorization.service';
import { ProjectPermissionGuard } from './presentation/guards/project-permission.guard';

@Module({
  imports: [forwardRef(() => ProjectsModule)],
  providers: [AuthorizationService, ProjectPermissionGuard],
  exports: [AuthorizationService, ProjectPermissionGuard],
})
export class AuthorizationModule {}
