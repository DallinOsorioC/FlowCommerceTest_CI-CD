import { Permission, Role } from '@flowcommerce/types';

// Matriz estática que asigna a cada rol los permisos que puede ejercer.
// Es la única fuente de verdad de "qué puede hacer cada rol?".
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  OWNER: [
    Permission.PROJECT_READ,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_UPDATE,
    Permission.PROJECT_DELETE,
    Permission.MEMBER_READ,
    Permission.MEMBER_INVITE,
    Permission.MEMBER_UPDATE_ROLE,
    Permission.MEMBER_REMOVE,
    Permission.LEAD_CREATE,
    Permission.LEAD_READ,
    Permission.LEAD_UPDATE,
    Permission.LEAD_DELETE,
    Permission.QUOTE_CREATE,
    Permission.QUOTE_READ,
    Permission.QUOTE_APPROVE,
    Permission.WHATSAPP_SEND_MESSAGE,
    Permission.PRODUCT_READ,
    Permission.PRODUCT_MANAGE,
    Permission.CLIENT_CREATE,
    Permission.CLIENT_READ,
    Permission.CLIENT_UPDATE,
    Permission.CLIENT_DELETE,
  ],
  ADMIN: [
    Permission.PROJECT_READ,
    Permission.PROJECT_CREATE,
    Permission.PROJECT_UPDATE,
    Permission.MEMBER_READ,
    Permission.MEMBER_INVITE,
    Permission.MEMBER_UPDATE_ROLE,
    Permission.MEMBER_REMOVE,
    Permission.LEAD_CREATE,
    Permission.LEAD_READ,
    Permission.LEAD_UPDATE,
    Permission.LEAD_DELETE,
    Permission.QUOTE_CREATE,
    Permission.QUOTE_READ,
    Permission.QUOTE_APPROVE,
    Permission.WHATSAPP_SEND_MESSAGE,
    Permission.PRODUCT_READ,
    Permission.PRODUCT_MANAGE,
    Permission.CLIENT_CREATE,
    Permission.CLIENT_READ,
    Permission.CLIENT_UPDATE,
    Permission.CLIENT_DELETE,
  ],
  MEMBER: [
    Permission.PROJECT_READ,
    Permission.MEMBER_READ,
    // Un MEMBER opera el embudo comercial: crea y mueve leads, cotiza y
    // escribe por WhatsApp. No aprueba cotizaciones ni borra leads: ambas son
    // decisiones irreversibles y quedan en ADMIN y OWNER.
    Permission.LEAD_CREATE,
    Permission.LEAD_READ,
    Permission.LEAD_UPDATE,
    Permission.QUOTE_CREATE,
    Permission.QUOTE_READ,
    Permission.WHATSAPP_SEND_MESSAGE,
    // El catálogo fija los precios: MEMBER lo consulta para cotizar, pero no lo
    // modifica. Crear, editar o desactivar productos queda en ADMIN y OWNER.
    Permission.PRODUCT_READ,
    // MEMBER gestiona su cartera de clientes; borrar uno queda en ADMIN y OWNER.
    Permission.CLIENT_CREATE,
    Permission.CLIENT_READ,
    Permission.CLIENT_UPDATE,
  ],
  VIEWER: [
    Permission.PROJECT_READ,
    Permission.MEMBER_READ,
    // Solo lectura del embudo, igual que MEMBER_READ para miembros.
    Permission.LEAD_READ,
    Permission.QUOTE_READ,
    Permission.PRODUCT_READ,
    Permission.CLIENT_READ,
  ],
};

// Devuelve true si el rol tiene el permiso indicado.
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// Devuelve true si el rol tiene TODOS los permisos indicados.
export function roleHasAllPermissions(
  role: Role,
  permissions: readonly Permission[],
): boolean {
  return permissions.every((permission) => roleHasPermission(role, permission));
}

// Devuelve true si el rol tiene AL MENOS UNO de los permisos indicados.
export function roleHasAnyPermission(
  role: Role,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((permission) => roleHasPermission(role, permission));
}
