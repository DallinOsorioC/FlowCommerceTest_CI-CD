import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '../../../common/exceptions/domain.exceptions';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { LeadEntity } from '../../domain/entities/lead.entity';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../domain/repositories/lead.repository';

export interface GetLeadInput {
  actorUserId: string;
  projectId: string;
  leadId: string;
}

@Injectable()
export class GetLeadUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
  ) {}

  // Obtiene un lead; 404 si no pertenece al proyecto. Un lead de otro tenant es
  // indistinguible de uno inexistente: nunca 403, para no confirmar que el id existe.
  async execute(input: GetLeadInput): Promise<LeadEntity> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.LEAD_READ,
      input.projectId,
    );

    const lead = await this.leadRepository.findByIdInProject(
      input.leadId,
      input.projectId,
    );

    if (!lead) {
      throw new NotFoundException('Lead not found in this project');
    }

    return lead;
  }
}
