import { Role } from '@flowcommerce/types';

// A mayor valor, mayor privilegio. Se usa para comparar la fuerza de los roles.
const ROLE_WEIGHT: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

// ¿Puede el actor gestionar (invitar, cambiar rol, eliminar) a un miembro cuyo
// rol actual es `targetRole`? OWNER gestiona cualquier rol; el resto, solo
// roles estrictamente inferiores.
export function canManageRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === Role.OWNER) {
    return true;
  }

  return ROLE_WEIGHT[targetRole] < ROLE_WEIGHT[actorRole];
}

// ¿Puede el actor asignar `targetRole`? Misma regla que `canManageRole`:
// OWNER puede otorgar cualquier rol; el resto solo roles inferiores.
export function canAssignRole(actorRole: Role, targetRole: Role): boolean {
  return canManageRole(actorRole, targetRole);
}

// Devuelve true si el rol permite la gestión operativa de miembros.
export function isMemberManager(role: Role): boolean {
  return role === Role.OWNER || role === Role.ADMIN;
}
