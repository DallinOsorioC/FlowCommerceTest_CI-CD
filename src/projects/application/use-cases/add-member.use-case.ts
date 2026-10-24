import { Inject, Injectable } from '@nestjs/common';
import { Permission, type Role } from '@flowcommerce/types';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../../common/exceptions/domain.exceptions';
import { USER_REPOSITORY } from '../../../users/domain/repositories/user.repository';
import type { UserRepository } from '../../../users/domain/repositories/user.repository';
import { canAssignRole } from '../../../authorization/domain/role.rules';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
  type ProjectMember,
} from '../../domain/repositories/membership.repository';

export interface AddMemberInput {
  actorUserId: string;
  projectId: string;
  targetUserId: string;
  role: Role;
}

@Injectable()
export class AddMemberUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: MembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: UserRepository,
  ) {}

  // Agrega un miembro al proyecto. Primero exige MEMBER_INVITE (defensa en
  // profundidad: no depende de que el controller tenga @RequirePermission) y
  // después aplica la jerarquía: el rol del actor debe poder asignar el rol
  // pedido.
  async execute(input: AddMemberInput): Promise<ProjectMember> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.MEMBER_INVITE,
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

    if (!canAssignRole(actorMembership.role, input.role)) {
      throw new ForbiddenException(
        'Your role cannot grant that role in this project',
      );
    }

    const targetUser = await this.userRepository.findById(input.targetUserId);
    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const existing = await this.membershipRepository.findByUserAndProject(
      input.targetUserId,
      input.projectId,
    );

    if (existing) {
      throw new ConflictException('User is already a member of this project');
    }

    const membership = await this.membershipRepository.create({
      userId: input.targetUserId,
      projectId: input.projectId,
      role: input.role,
    });

    return {
      membership,
      userId: membership.userId,
      name: targetUser.name,
      email: targetUser.email,
    };
  }
}
