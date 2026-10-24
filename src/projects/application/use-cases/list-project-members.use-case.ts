import { Inject, Injectable } from '@nestjs/common';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../../authorization/application/services/authorization.service';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
  type ProjectMember,
} from '../../domain/repositories/membership.repository';

export interface ListProjectMembersInput {
  actorUserId: string;
  projectId: string;
}

@Injectable()
export class ListProjectMembersUseCase {
  constructor(
    private readonly authorizationService: AuthorizationService,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: MembershipRepository,
  ) {}

  // Devuelve los miembros del proyecto. assertCan(MEMBER_READ) ya implica que
  // el actor es miembro (sin membresía no hay permiso), así que sustituye a la
  // comprobación manual de membresía.
  async execute(input: ListProjectMembersInput): Promise<ProjectMember[]> {
    await this.authorizationService.assertCan(
      input.actorUserId,
      Permission.MEMBER_READ,
      input.projectId,
    );

    return this.membershipRepository.findMembersByProject(input.projectId);
  }
}
