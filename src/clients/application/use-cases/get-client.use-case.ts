import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import { NotFoundException } from '../../../common/exceptions/domain.exceptions';
import { ClientEntity } from '../../domain/entities/client.entity';
import {
  CLIENTS_REPOSITORY,
  type ClientRepository,
} from '../../domain/repositories/client.repository';

export interface GetClientInput {
  actorUserId: string;
  projectId: string;
  clientId: string;
}

@Injectable()
export class GetClientUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(CLIENTS_REPOSITORY)
    private readonly clientRepository: ClientRepository,
  ) {}

  // Un cliente de otro tenant responde 404, igual que uno inexistente.
  async execute(input: GetClientInput): Promise<ClientEntity> {
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

    return client;
  }
}
