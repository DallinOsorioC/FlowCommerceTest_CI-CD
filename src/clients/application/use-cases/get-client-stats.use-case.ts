import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { NotFoundException } from '../../../common/exceptions/domain.exceptions';
import {
  CLIENTS_REPOSITORY,
  type ClientRepository,
  type ClientStats,
} from '../../domain/repositories/client.repository';

export interface GetClientStatsInput {
  actorUserId: string;
  projectId: string;
  clientId: string;
}

@Injectable()
export class GetClientStatsUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(CLIENTS_REPOSITORY)
    private readonly clientRepository: ClientRepository,
  ) {}

  // Un cliente de otro tenant responde 404, igual que uno inexistente: primero
  // se comprueba que existe en el proyecto y solo entonces se agregan sus
  // cotizaciones.
  async execute(input: GetClientStatsInput): Promise<ClientStats> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.CLIENT_READ,
      input.projectId,
    );

    const client = await this.clientRepository.findByIdInProject(
      input.clientId,
      input.projectId,
    );
    if (!client) {
      throw new NotFoundException('Client not found in this project');
    }

    return this.clientRepository.getStatsInProject(
      input.clientId,
      input.projectId,
    );
  }
}
