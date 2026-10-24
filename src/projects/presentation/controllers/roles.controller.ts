import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import {
  buildRoleCatalog,
  type RoleCatalog,
} from '../../../authorization/domain/role-catalog';
import { RoleCatalogDto } from '../dto/role-catalog.dto';

// Pestaña «Roles» de Configuración. Solo lectura: los permisos de cada rol
// son una matriz fija del sistema (no se editan por proyecto).
@ApiTags('projects')
@Controller({ path: 'projects/:projectId/roles', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class RolesController {
  @Get()
  @RequirePermission(Permission.MEMBER_READ)
  @ApiOperation({
    summary: 'Roles y permisos del sistema',
    description:
      'Los cuatro roles con su descripción y permisos, y el catálogo de permisos agrupado por área para dibujar la matriz. Cualquier miembro puede verlo.',
  })
  @ApiOkResponse({ type: RoleCatalogDto })
  list(): RoleCatalog {
    return buildRoleCatalog();
  }
}
