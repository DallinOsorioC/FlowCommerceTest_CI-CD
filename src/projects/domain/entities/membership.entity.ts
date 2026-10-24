import type { Membership, Role } from '@flowcommerce/types';

// Entidad de dominio que relaciona un usuario con un proyecto indicando su rol.
export class MembershipEntity implements Membership {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly projectId: string,
    public readonly role: Role,
    public readonly creadoEn: Date,
    public readonly actualizadoEn: Date,
  ) {}

  toMembership(): Membership {
    return {
      id: this.id,
      userId: this.userId,
      projectId: this.projectId,
      role: this.role,
      creadoEn: this.creadoEn,
      actualizadoEn: this.actualizadoEn,
    };
  }
}
