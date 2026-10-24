import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../../common/dto/trim.transform';

export class UserProfileDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ example: '+57 300 123 4567', nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ example: 'Gerente comercial', nullable: true })
  position!: string | null;

  @ApiPropertyOptional({
    example: '/api/v1/users/0b6f.../avatar?v=3f2a...',
    nullable: true,
    description: 'Ruta de la foto de perfil (null si no tiene)',
  })
  avatarUrl!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  creadoEn!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  actualizadoEn!: Date;
}

// Nombre, teléfono y puesto (N11). El correo y la contraseña se
// gestionan en Supabase Auth.
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Ana López' })
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: '+57 300 123 4567', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional({ example: 'Gerente comercial', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string | null;
}
