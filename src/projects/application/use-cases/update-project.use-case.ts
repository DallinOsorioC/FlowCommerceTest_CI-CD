import { Inject, Injectable } from '@nestjs/common';
import { Permission, type ProjectDetail } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { NotFoundException } from '../../../common/exceptions/domain.exceptions';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
  type UpdateProjectInput as RepoUpdateProjectInput,
} from '../../domain/repositories/project.repository';

export interface UpdateProjectInput extends RepoUpdateProjectInput {
  actorUserId: string;
  projectId: string;
}

@Injectable()
export class UpdateProjectUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  // Edita nombre, descripción, perfil de facturación y ajustes de cotización
  // (PROJECT_UPDATE: OWNER y ADMIN). El slug no se puede cambiar: es la
  // identidad pública del proyecto. Los ajustes de cotización solo afectan a
  // las cotizaciones que se creen o editen a partir de ahora.
  async execute(input: UpdateProjectInput): Promise<ProjectDetail> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.PROJECT_UPDATE,
      input.projectId,
    );

    const updated = await this.projectRepository.update(input.projectId, {
      name: input.name,
      description: input.description,
      billing: input.billing,
      quoteSettings: input.quoteSettings,
    });
    if (!updated) {
      throw new NotFoundException('Project not found');
    }
    return updated.toProjectDetail();
  }
}
