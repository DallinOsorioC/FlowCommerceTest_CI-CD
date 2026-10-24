import { ApiProperty } from '@nestjs/swagger';
import { Permission, Role } from '@flowcommerce/types';

export class RoleInfoDto {
  @ApiProperty({ enum: Role }) role!: Role;

  @ApiProperty({ example: 'Asesor comercial' }) label!: string;

  @ApiProperty() description!: string;

  @ApiProperty({
    enum: Permission,
    isArray: true,
    description: 'Permisos que ejerce este rol',
  })
  permissions!: Permission[];
}

export class PermissionInfoDto {
  @ApiProperty({ enum: Permission }) key!: Permission;

  @ApiProperty({ example: 'Cotizaciones' }) area!: string;

  @ApiProperty({ example: 'Aprobar y rechazar cotizaciones' }) label!: string;
}

export class RoleCatalogDto {
  @ApiProperty({
    type: RoleInfoDto,
    isArray: true,
    description: 'De más a menos poder',
  })
  roles!: RoleInfoDto[];

  @ApiProperty({ type: PermissionInfoDto, isArray: true })
  permissions!: PermissionInfoDto[];
}
