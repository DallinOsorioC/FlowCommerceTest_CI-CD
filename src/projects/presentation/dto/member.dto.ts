import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@flowcommerce/types';

export class MemberDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ enum: Role })
  role!: Role;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Solo en el listado de miembros',
  })
  phone?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  position?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Ruta de la foto de perfil',
  })
  avatarUrl?: string | null;
}
