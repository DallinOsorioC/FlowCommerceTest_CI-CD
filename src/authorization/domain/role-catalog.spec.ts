import { Permission, Role } from '@flowcommerce/types';
import { buildRoleCatalog } from './role-catalog';
import { ROLE_PERMISSIONS } from './role-permissions';

describe('role catalog (pestaña Roles)', () => {
  const catalog = buildRoleCatalog();

  it('names every permission, so a new one cannot ship without a label', () => {
    expect(catalog.permissions.map((p) => p.key).sort()).toEqual(
      Object.values(Permission).sort(),
    );
    for (const permission of catalog.permissions) {
      expect(permission.label).not.toBe('');
      expect(permission.area).not.toBe('');
    }
  });

  it('lists the four roles from most to least powerful', () => {
    expect(catalog.roles.map((r) => r.role)).toEqual([
      Role.OWNER,
      Role.ADMIN,
      Role.MEMBER,
      Role.VIEWER,
    ]);
  });

  it('exposes exactly the real permission matrix, never its own copy', () => {
    for (const entry of catalog.roles) {
      expect(entry.permissions).toEqual([...ROLE_PERMISSIONS[entry.role]]);
    }
  });

  it('keeps the privilege ordering: each role has no more than the one above', () => {
    const sizes = catalog.roles.map((r) => r.permissions.length);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
    expect(catalog.roles[0].permissions).toEqual(
      expect.arrayContaining(Object.values(Permission)),
    );
  });
});
