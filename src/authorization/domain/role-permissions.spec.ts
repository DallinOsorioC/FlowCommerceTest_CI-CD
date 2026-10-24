import { Permission, Role } from '@flowcommerce/types';
import {
  roleHasAllPermissions,
  roleHasAnyPermission,
  roleHasPermission,
  ROLE_PERMISSIONS,
} from './role-permissions';

describe('role-permissions matrix', () => {
  it('defines a permission set for every role', () => {
    for (const role of [Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER]) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });

  it('grants OWNER every permission', () => {
    for (const permission of Object.values(Permission)) {
      expect(roleHasPermission(Role.OWNER, permission)).toBe(true);
    }
  });

  it('gives ADMIN full operational control except PROJECT_DELETE', () => {
    expect(roleHasPermission(Role.ADMIN, Permission.PROJECT_DELETE)).toBe(
      false,
    );
    expect(roleHasPermission(Role.ADMIN, Permission.PROJECT_UPDATE)).toBe(true);
    expect(roleHasPermission(Role.ADMIN, Permission.MEMBER_INVITE)).toBe(true);
    expect(roleHasPermission(Role.ADMIN, Permission.MEMBER_REMOVE)).toBe(true);
    expect(roleHasPermission(Role.ADMIN, Permission.LEAD_DELETE)).toBe(true);
  });

  it('exposes no permission for the retired resources module', () => {
    // El módulo de ejemplo se eliminó y sus permisos se retiraron del enum
    // compartido. No se dejan valores muertos: si quedaran, cualquier código que
    // iterara Object.values(Permission) los trataría como permisos reales.
    const names = Object.values(Permission) as string[];
    expect(names.filter((name) => name.startsWith('RESOURCE_'))).toEqual([]);
  });

  it('grants every declared permission to at least one role', () => {
    // Invariante del enum: un permiso que ningún rol otorga es inalcanzable y
    // sería un endpoint que siempre responde 403.
    const allRoles = [Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER];
    const orphaned = (Object.values(Permission) as Permission[]).filter(
      (permission) =>
        !allRoles.some((role) => roleHasPermission(role, permission)),
    );

    expect(orphaned).toEqual([]);
  });

  it('lets MEMBER operate the funnel but never delete a lead', () => {
    expect(roleHasPermission(Role.MEMBER, Permission.LEAD_CREATE)).toBe(true);
    expect(roleHasPermission(Role.MEMBER, Permission.LEAD_UPDATE)).toBe(true);
    // Borrar un lead es irreversible y arrastra sus cotizaciones y mensajes por
    // la FK compuesta con ON DELETE CASCADE. Queda en ADMIN y OWNER.
    expect(roleHasPermission(Role.MEMBER, Permission.LEAD_DELETE)).toBe(false);
    expect(roleHasPermission(Role.MEMBER, Permission.MEMBER_INVITE)).toBe(
      false,
    );
    expect(roleHasPermission(Role.MEMBER, Permission.PROJECT_UPDATE)).toBe(
      false,
    );
  });

  it('restricts VIEWER to read-only access, including CRM', () => {
    expect(roleHasPermission(Role.VIEWER, Permission.PROJECT_READ)).toBe(true);
    expect(roleHasPermission(Role.VIEWER, Permission.MEMBER_READ)).toBe(true);
    expect(roleHasPermission(Role.VIEWER, Permission.PROJECT_UPDATE)).toBe(
      false,
    );
    expect(roleHasPermission(Role.VIEWER, Permission.LEAD_CREATE)).toBe(false);
    expect(roleHasPermission(Role.VIEWER, Permission.LEAD_UPDATE)).toBe(false);
    expect(roleHasPermission(Role.VIEWER, Permission.LEAD_DELETE)).toBe(false);
    expect(roleHasPermission(Role.VIEWER, Permission.QUOTE_CREATE)).toBe(false);
    expect(roleHasPermission(Role.VIEWER, Permission.QUOTE_APPROVE)).toBe(
      false,
    );
    expect(
      roleHasPermission(Role.VIEWER, Permission.WHATSAPP_SEND_MESSAGE),
    ).toBe(false);
  });

  it('grants ADMIN the whole CRM surface', () => {
    for (const permission of [
      Permission.LEAD_CREATE,
      Permission.LEAD_READ,
      Permission.LEAD_UPDATE,
      Permission.QUOTE_CREATE,
      Permission.QUOTE_READ,
      Permission.QUOTE_APPROVE,
      Permission.WHATSAPP_SEND_MESSAGE,
    ]) {
      expect(roleHasPermission(Role.ADMIN, permission)).toBe(true);
    }
  });

  it('lets MEMBER work leads and quotes but never approve or delete them', () => {
    expect(roleHasPermission(Role.MEMBER, Permission.LEAD_CREATE)).toBe(true);
    expect(roleHasPermission(Role.MEMBER, Permission.LEAD_READ)).toBe(true);
    expect(roleHasPermission(Role.MEMBER, Permission.LEAD_UPDATE)).toBe(true);
    expect(roleHasPermission(Role.MEMBER, Permission.QUOTE_CREATE)).toBe(true);
    expect(roleHasPermission(Role.MEMBER, Permission.QUOTE_READ)).toBe(true);
    expect(
      roleHasPermission(Role.MEMBER, Permission.WHATSAPP_SEND_MESSAGE),
    ).toBe(true);

    // Aprobar cotizaciones es una decisión comercial: nunca se delega en MEMBER.
    expect(roleHasPermission(Role.MEMBER, Permission.QUOTE_APPROVE)).toBe(
      false,
    );
    expect(roleHasPermission(Role.MEMBER, Permission.LEAD_DELETE)).toBe(false);
  });

  it('lets every role read the catalog but only OWNER and ADMIN manage it', () => {
    for (const role of [Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER]) {
      expect(roleHasPermission(role, Permission.PRODUCT_READ)).toBe(true);
    }
    expect(roleHasPermission(Role.OWNER, Permission.PRODUCT_MANAGE)).toBe(true);
    expect(roleHasPermission(Role.ADMIN, Permission.PRODUCT_MANAGE)).toBe(true);
    expect(roleHasPermission(Role.MEMBER, Permission.PRODUCT_MANAGE)).toBe(
      false,
    );
    expect(roleHasPermission(Role.VIEWER, Permission.PRODUCT_MANAGE)).toBe(
      false,
    );
  });

  it('lets MEMBER manage clients but only OWNER and ADMIN delete them', () => {
    for (const role of [Role.OWNER, Role.ADMIN, Role.MEMBER]) {
      expect(roleHasPermission(role, Permission.CLIENT_CREATE)).toBe(true);
      expect(roleHasPermission(role, Permission.CLIENT_UPDATE)).toBe(true);
    }
    expect(roleHasPermission(Role.MEMBER, Permission.CLIENT_DELETE)).toBe(
      false,
    );
    expect(roleHasPermission(Role.ADMIN, Permission.CLIENT_DELETE)).toBe(true);
    expect(roleHasPermission(Role.VIEWER, Permission.CLIENT_READ)).toBe(true);
    expect(roleHasPermission(Role.VIEWER, Permission.CLIENT_CREATE)).toBe(
      false,
    );
  });

  it('evaluates ALL vs ANY semantics', () => {
    expect(
      roleHasAllPermissions(Role.ADMIN, [
        Permission.MEMBER_READ,
        Permission.MEMBER_INVITE,
      ]),
    ).toBe(true);
    expect(
      roleHasAnyPermission(Role.MEMBER, [
        Permission.PROJECT_DELETE,
        Permission.LEAD_CREATE,
      ]),
    ).toBe(true);
    expect(
      roleHasAllPermissions(Role.MEMBER, [
        Permission.LEAD_DELETE,
        Permission.MEMBER_INVITE,
      ]),
    ).toBe(false);
  });
});
