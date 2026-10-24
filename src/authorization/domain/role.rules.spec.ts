import { Role } from '@flowcommerce/types';
import { canAssignRole, canManageRole, isMemberManager } from './role.rules';

describe('role.rules', () => {
  describe('canManageRole', () => {
    it('lets OWNER manage any role', () => {
      expect(canManageRole(Role.OWNER, Role.OWNER)).toBe(true);
      expect(canManageRole(Role.OWNER, Role.ADMIN)).toBe(true);
      expect(canManageRole(Role.OWNER, Role.MEMBER)).toBe(true);
      expect(canManageRole(Role.OWNER, Role.VIEWER)).toBe(true);
    });

    it('lets ADMIN manage only strictly lower roles', () => {
      expect(canManageRole(Role.ADMIN, Role.OWNER)).toBe(false);
      expect(canManageRole(Role.ADMIN, Role.ADMIN)).toBe(false);
      expect(canManageRole(Role.ADMIN, Role.MEMBER)).toBe(true);
      expect(canManageRole(Role.ADMIN, Role.VIEWER)).toBe(true);
    });

    it('lets MEMBER manage only VIEWER', () => {
      expect(canManageRole(Role.MEMBER, Role.OWNER)).toBe(false);
      expect(canManageRole(Role.MEMBER, Role.ADMIN)).toBe(false);
      expect(canManageRole(Role.MEMBER, Role.MEMBER)).toBe(false);
      expect(canManageRole(Role.MEMBER, Role.VIEWER)).toBe(true);
    });

    it('lets VIEWER manage nobody', () => {
      for (const target of [Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER]) {
        expect(canManageRole(Role.VIEWER, target)).toBe(false);
      }
    });
  });

  describe('canAssignRole', () => {
    it('lets OWNER assign any role', () => {
      for (const target of [Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER]) {
        expect(canAssignRole(Role.OWNER, target)).toBe(true);
      }
    });

    it('lets ADMIN assign only strictly lower roles (never OWNER/ADMIN)', () => {
      expect(canAssignRole(Role.ADMIN, Role.OWNER)).toBe(false);
      expect(canAssignRole(Role.ADMIN, Role.ADMIN)).toBe(false);
      expect(canAssignRole(Role.ADMIN, Role.MEMBER)).toBe(true);
      expect(canAssignRole(Role.ADMIN, Role.VIEWER)).toBe(true);
    });

    it('lets MEMBER assign only VIEWER', () => {
      expect(canAssignRole(Role.MEMBER, Role.VIEWER)).toBe(true);
      expect(canAssignRole(Role.MEMBER, Role.MEMBER)).toBe(false);
    });

    it('blocks VIEWER from assigning any role', () => {
      for (const target of [Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER]) {
        expect(canAssignRole(Role.VIEWER, target)).toBe(false);
      }
    });
  });

  describe('isMemberManager', () => {
    it('is true only for OWNER and ADMIN', () => {
      expect(isMemberManager(Role.OWNER)).toBe(true);
      expect(isMemberManager(Role.ADMIN)).toBe(true);
      expect(isMemberManager(Role.MEMBER)).toBe(false);
      expect(isMemberManager(Role.VIEWER)).toBe(false);
    });
  });
});
