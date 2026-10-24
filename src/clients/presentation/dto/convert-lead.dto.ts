import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { LeadDto } from '../../../leads/presentation/dto/lead.dto';
import { ClientDto } from './client.dto';

// Datos opcionales para completar el cliente al convertir. Nombre, email y
// teléfono se copian del lead.
export class ConvertLeadDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Vincula el lead a un cliente EXISTENTE (activo, del mismo proyecto) en vez de crear uno nuevo. No se puede combinar con company, taxId ni assignedUserId.',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({
    example: 'Constructora Nova',
    nullable: true,
    description: 'Por defecto, la empresa del lead',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string | null;

  @ApiPropertyOptional({
    example: '7745213-8',
    nullable: true,
    description: 'NIT',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxId?: string | null;

  @ApiPropertyOptional({
    format: 'uuid',
    nullable: true,
    description: 'Por defecto, el responsable del lead',
  })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @ApiPropertyOptional({
    default: false,
    description: 'true = mueve además el lead a WON',
  })
  @IsOptional()
  @IsBoolean()
  markAsWon?: boolean;
}

export class ConvertLeadResponseDto {
  @ApiProperty({ type: ClientDto })
  client!: ClientDto;

  @ApiProperty({ type: LeadDto })
  lead!: LeadDto;

  @ApiProperty({
    type: ClientDto,
    isArray: true,
    description:
      'Informativo: otros clientes del proyecto con el mismo email o la misma empresa que el cliente recién creado (máx. 5). Siempre vacío cuando se envía clientId.',
  })
  possibleDuplicates!: ClientDto[];
}
