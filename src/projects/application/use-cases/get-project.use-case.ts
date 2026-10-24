import { Inject, Injectable } from '@nestjs/common';
import { Permission, type ProjectDetail } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { NotFoundException } from '../../../common/exceptions/domain.exceptions';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../domain/repositories/project.repository';

export interface GetProjectInput {
  actorUserId: string;
  projectId: string;
}

@Injectable()
export class GetProjectUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  // Detalle del proyecto con su perfil de facturación y ajustes de cotización.
  async execute(input: GetProjectInput): Promise<ProjectDetail> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PROJECT_READ,
      input.projectId,
    );

    const project = await this.projectRepository.findById(input.projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project.toProjectDetail();
  }
}
