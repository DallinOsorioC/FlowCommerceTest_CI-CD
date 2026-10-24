import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../../common/dto/trim.transform';

// PATCH parcial. null borra un campo; ausente = no tocar. active=false desactiva.
export class UpdateClientDto {
  @ApiPropertyOptional({ example: 'Rodrigo Castillo', maxLength: 255 })
  @Trim()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({ example: 'Transportes Quetzal', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string | null;

  @ApiPropertyOptional({
    example: 'Gerente de Proyectos',
    nullable: true,
    description: 'Cargo del contacto principal (sale en el PDF)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contactPosition?: string | null;

  @ApiPropertyOptional({
    example: '7745213-8',
    nullable: true,
    description: 'NIT',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxId?: string | null;

  @ApiPropertyOptional({ example: 'rcastillo@tquetzal.gt', nullable: true })
  @IsOptional()
  @IsEmail({}, { message: 'email debe ser una dirección válida' })
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional({ example: '+502 5566 4412', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Responsable: debe ser miembro del proyecto',
  })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @ApiPropertyOptional({ description: 'false = desactivar' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
