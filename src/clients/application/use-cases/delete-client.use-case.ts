import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { isForeignKeyViolation } from '../../../common/utils/postgres-error';
import {
  CLIENTS_REPOSITORY,
  type ClientRepository,
} from '../../domain/repositories/client.repository';

export interface DeleteClientInput {
  actorUserId: string;
  projectId: string;
  clientId: string;
}

@Injectable()
export class DeleteClientUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(CLIENTS_REPOSITORY)
    private readonly clientRepository: ClientRepository,
  ) {}

  // Borrado definitivo (CLIENT_DELETE: OWNER y ADMIN). Si el cliente tiene
  // leads o cotizaciones asociadas, la base lo impide y se responde 409: en ese
  // caso hay que desactivarlo (PATCH active=false) para conservar el historial.
  async execute(input: DeleteClientInput): Promise<void> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.CLIENT_DELETE,
      input.projectId,
    );

    let deleted: boolean;
    try {
      deleted = await this.clientRepository.deleteInProject(
        input.clientId,
        input.projectId,
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Client has related leads or quotes; deactivate it instead',
        );
      }
      throw error;
    }

    if (!deleted) {
      throw new NotFoundException('Client not found in this project');
    }
  }
}
