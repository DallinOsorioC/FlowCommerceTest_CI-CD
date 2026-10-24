import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@flowcommerce/types';

export const REQUIRED_PERMISSIONS_KEY = 'authorization:required-permissions';

export type RequiredPermissions = readonly Permission[];

// Declara los permisos requeridos para acceder a una ruta. Se usa junto con el
// `ProjectPermissionGuard`:
//   @UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
//   @RequirePermission(Permission.PROJECT_UPDATE)
export const RequirePermission = (
  ...permissions: readonly Permission[]
): MethodDecorator => SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
