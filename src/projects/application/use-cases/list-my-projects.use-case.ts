import { Inject, Injectable } from '@nestjs/common';
import type { UserMembership } from '@flowcommerce/types';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../domain/repositories/membership.repository';

@Injectable()
export class ListMyProjectsUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: MembershipRepository,
  ) {}

  // Devuelve los proyectos del usuario con el rol que tiene en cada uno.
  execute(userId: string): Promise<UserMembership[]> {
    return this.membershipRepository.findMyProjects(userId);
  }
}
