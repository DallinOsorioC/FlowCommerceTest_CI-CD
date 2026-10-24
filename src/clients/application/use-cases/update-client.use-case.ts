import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  ConflictException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { isUniqueViolation } from '../../../common/utils/postgres-error';
import { assertAssignableMember } from '../../../projects/application/services/assignable-member';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../../projects/domain/repositories/membership.repository';
import { ClientEntity } from '../../domain/entities/client.entity';
import {
  CLIENTS_REPOSITORY,
  type ClientRepository,
  type UpdateClientInput as RepoUpdateClientInput,
} from '../../domain/repositories/client.repository';
import { normalizeTaxId } from '../../domain/normalize-tax-id';

export interface UpdateClientInput extends RepoUpdateClientInput {
  actorUserId: string;
  projectId: string;
  clientId: string;
}

@Injectable()
export class UpdateClientUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(CLIENTS_REPOSITORY)
    private readonly clientRepository: ClientRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: MembershipRepository,
  ) {}

  // PATCH parcial tras verificar CLIENT_UPDATE. `active: false` desactiva.
  async execute(input: UpdateClientInput): Promise<ClientEntity> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.CLIENT_UPDATE,
      input.projectId,
    );

    await assertAssignableMember(
      this.membershipRepository,
      input.assignedUserId,
      input.projectId,
    );

    try {
      const updated = await this.clientRepository.updateInProject(
        input.clientId,
        input.projectId,
        {
          name: input.name?.trim(),
          company: input.company,
          taxId: normalizeTaxId(input.taxId),
          email: input.email,
          phone: input.phone,
          notes: input.notes,
          assignedUserId: input.assignedUserId,
          active: input.active,
          contactPosition: input.contactPosition,
        },
      );

      if (!updated) {
        throw new NotFoundException('Client not found in this project');
      }

      return updated;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A client with that tax id already exists in this project',
        );
      }
      throw error;
    }
  }
}
