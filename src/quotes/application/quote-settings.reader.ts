import { Inject, Injectable } from '@nestjs/common';
import type { ProjectQuoteSettings } from '@flowcommerce/types';
import { NotFoundException } from '../../common/exceptions/domain.exceptions';
import {
  PROJECT_REPOSITORY,
  type ProjectRepository,
} from '../../projects/domain/repositories/project.repository';

// Ajustes de cotización del proyecto (IVA, prefijo de folio, vigencia,
// condiciones por defecto y moneda). Se leen en cada operación: cambiarlos en
// PATCH /projects/:id afecta solo a las cotizaciones que se creen o editen
// después, nunca a las ya guardadas.
@Injectable()
export class QuoteSettingsReader {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly projectRepository: ProjectRepository,
  ) {}

  async get(projectId: string): Promise<ProjectQuoteSettings> {
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project.quoteSettings;
  }
}
