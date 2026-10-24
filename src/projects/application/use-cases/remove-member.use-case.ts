import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import {
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { canManageRole } from '../../../authorization/domain/role.rules';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../domain/repositories/membership.repository';

export interface RemoveMemberInput {
  actorUserId: string;
  projectId: string;
  targetMembershipId: string;
}

@Injectable()
export class RemoveMemberUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: MembershipRepository,
  ) {}

  // Elimina a un miembro del proyecto, protegiendo al último OWNER. Sus leads
  // y clientes de este proyecto quedan sin responsable. Exige
  // MEMBER_REMOVE antes de nada (defensa en profundidad) y el DELETE va acotado
  // por projectId.
  async execute(input: RemoveMemberInput): Promise<void> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.MEMBER_REMOVE,
      input.projectId,
    );

    const actorMembership =
      await this.membershipRepository.findByUserAndProject(
        input.actorUserId,
        input.projectId,
      );

    if (!actorMembership) {
      throw new ForbiddenException('You are not a member of this project');
    }

    const targetMembership = await this.membershipRepository.findByIdInProject(
      input.targetMembershipId,
      input.projectId,
    );

    if (!targetMembership) {
      throw new NotFoundException('Membership not found in this project');
    }

    if (!canManageRole(actorMembership.role, targetMembership.role)) {
      throw new ForbiddenException(
        'Your role cannot manage that member in this project',
      );
    }

    // Atómico en el repositorio: protege al último OWNER y deja sin
    // responsable los leads y clientes que tenía asignados en este proyecto.
    const result = await this.membershipRepository.deleteInProject(
      input.targetMembershipId,
      input.projectId,
    );

    if (result === 'last_owner') {
      throw new ForbiddenException(
        'Cannot remove the last OWNER of the project',
      );
    }
    if (result === 'not_found') {
      throw new NotFoundException('Membership not found in this project');
    }
  }
}
