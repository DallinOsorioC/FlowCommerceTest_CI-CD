import { Inject, Injectable } from '@nestjs/common';
import type { Permission, Role } from '@flowcommerce/types';
import { ForbiddenException } from '../../../common/exceptions/domain.exceptions';
import { MEMBERSHIP_REPOSITORY } from '../../../projects/domain/repositories/membership.repository';
import type { MembershipRepository } from '../../../projects/domain/repositories/membership.repository';
import {
  roleHasAllPermissions,
  roleHasPermission,
} from '../../domain/role-permissions';

export interface PermissionDecision {
  allowed: boolean;
  role: Role | null;
}

@Injectable()
export class AuthorizationService {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepository: MembershipRepository,
  ) {}

  // Valida que `userId` pertenezca a `projectId` y que el rol de su membership
  // incluya `permission`. ALLOW -> true, DENY -> false.
  async can(
    userId: string,
    permission: Permission,
    projectId: string,
  ): Promise<boolean> {
    const decision = await this.decide(userId, [permission], projectId);
    return decision.allowed;
  }

  // Igual que `can` pero exige que se cumplan TODOS los permisos.
  async canAll(
    userId: string,
    permissions: readonly Permission[],
    projectId: string,
  ): Promise<boolean> {
    const decision = await this.decide(userId, permissions, projectId);
    return decision.allowed;
  }

  // Valida membership + rol + permisos y expone el rol resuelto para que
  // guards y use-cases apliquen reglas de negocio más finas.
  async decide(
    userId: string,
    permissions: readonly Permission[],
    projectId: string,
  ): Promise<PermissionDecision> {
    const membership = await this.membershipRepository.findByUserAndProject(
      userId,
      projectId,
    );

    if (!membership) {
      return { allowed: false, role: null };
    }

    const allowed = roleHasAllPermissions(membership.role, permissions);
    return { allowed, role: membership.role };
  }

  // Devuelve true si el rol concede al menos uno de los permisos dados.
  // Útil para comprobaciones tipo "LEER o ESCRIBIR".
  roleHasAny(role: Role, permissions: readonly Permission[]): boolean {
    return permissions.some((permission) =>
      roleHasPermission(role, permission),
    );
  }

  // Lanza ForbiddenException si `userId` no está autorizado en `projectId`.
  // Los use-cases lo invocan como defensa en profundidad, aunque el guard ya
  // haya validado el permiso en el límite HTTP.
  async assertCan(
    userId: string,
    permission: Permission,
    projectId: string,
  ): Promise<void> {
    const allowed = await this.can(userId, permission, projectId);
    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions for this project');
    }
  }
}
