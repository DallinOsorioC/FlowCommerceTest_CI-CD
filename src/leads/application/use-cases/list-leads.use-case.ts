import { Inject, Injectable } from '@nestjs/common';
import {
  Permission,
  type LeadSource,
  type LeadStage,
} from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
  type LeadSortField,
  type PaginatedLeads,
} from '../../domain/repositories/lead.repository';

export interface ListLeadsInput {
  actorUserId: string;
  projectId: string;
  stage?: LeadStage;
  stages?: LeadStage[];
  search?: string;
  assignedUserId?: string;
  source?: LeadSource;
  clientId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  sortBy?: LeadSortField;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

@Injectable()
export class ListLeadsUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
  ) {}

  // Lista solo los leads del tenant indicado. El projectId es obligatorio y se
  // aplica dentro de la consulta; los filtros y la paginación son adicionales,
  // nunca sustitutos. El total también viene filtrado por proyecto.
  async execute(input: ListLeadsInput): Promise<PaginatedLeads> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.LEAD_READ,
      input.projectId,
    );

    return this.leadRepository.listByProject(input.projectId, {
      stage: input.stage,
      stages: input.stages,
      search: input.search,
      assignedUserId: input.assignedUserId,
      source: input.source,
      clientId: input.clientId,
      createdFrom: input.createdFrom,
      createdTo: input.createdTo,
      sortBy: input.sortBy,
      order: input.order,
      page: input.page,
      limit: input.limit,
    });
  }
}
