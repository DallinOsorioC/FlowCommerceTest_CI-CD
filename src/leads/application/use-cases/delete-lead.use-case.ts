import { Inject, Injectable } from '@nestjs/common';
import {
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  LEADS_REPOSITORY,
  type LeadRepository,
} from '../../domain/repositories/lead.repository';

export interface DeleteLeadInput {
  actorUserId: string;
  projectId: string;
  leadId: string;
}

@Injectable()
export class DeleteLeadUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(LEADS_REPOSITORY)
    private readonly leadRepository: LeadRepository,
  ) {}

  // Elimina un lead tras verificar LEAD_DELETE. El projectId viaja hasta el
  // WHERE del DELETE, así que borrar un lead de otro tenant no afecta ninguna
  // fila y produce el mismo 404 que un lead inexistente.
  //
  // Un lead con historial comercial NO se borra (409): ni con cotizaciones
  // fuera de DRAFT (enviadas, aceptadas, pagadas…), ni con mensajes (registro de
  // auditoría), ni convertido en cliente. La forma de retirarlo del embudo es pasarlo a LOST.
  // Los borradores sí caen con el lead.
  async execute(input: DeleteLeadInput): Promise<void> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.LEAD_DELETE,
      input.projectId,
    );

    const result = await this.leadRepository.deleteInProject(
      input.leadId,
      input.projectId,
    );

    if (result === 'NOT_FOUND') {
      throw new NotFoundException('Lead not found in this project');
    }
    if (result === 'HAS_HISTORY') {
      throw new ConflictException(
        'Lead has quotes beyond DRAFT, messages or a converted client and cannot be deleted; mark it as LOST instead',
      );
    }
  }
}
