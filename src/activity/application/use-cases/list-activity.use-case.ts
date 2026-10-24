import { Inject, Injectable } from '@nestjs/common';
import { Permission, type ActivityType } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  ACTIVITY_REPOSITORY,
  type ActivityRepository,
  type ActivityView,
} from '../../domain/activity';

export interface ListActivityInput {
  actorUserId: string;
  projectId: string;
  leadId?: string;
  clientId?: string;
  quoteId?: string;
  types?: ActivityType[];
  page: number;
  limit: number;
}

// Historial de actividad del proyecto (o de un lead, cliente o cotización).
// Lo puede leer cualquiera que pueda ver leads, también VIEWER. Un id de otro
// tenant no da error: simplemente no tiene eventos en este proyecto.
@Injectable()
export class ListActivityUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(ACTIVITY_REPOSITORY)
    private readonly repository: ActivityRepository,
  ) {}

  async execute(
    input: ListActivityInput,
  ): Promise<{ events: ActivityView[]; total: number }> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.LEAD_READ,
      input.projectId,
    );
    return this.repository.list(input.projectId, {
      leadId: input.leadId,
      clientId: input.clientId,
      quoteId: input.quoteId,
      types: input.types,
      page: input.page,
      limit: input.limit,
    });
  }
}
