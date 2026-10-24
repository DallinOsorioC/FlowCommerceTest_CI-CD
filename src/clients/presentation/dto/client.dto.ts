import { ApiProperty } from '@nestjs/swagger';

export class AssignedUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Mariana Ruiz' })
  name!: string;
}

export class ClientDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({
    example: 'Rodrigo Castillo',
    description: 'Contacto principal',
  })
  name!: string;

  @ApiProperty({ example: 'Transportes Quetzal', nullable: true, type: String })
  company!: string | null;

  @ApiProperty({
    example: 'Gerente de Proyectos',
    nullable: true,
    type: String,
    description: 'Cargo del contacto principal',
  })
  contactPosition!: string | null;

  @ApiProperty({
    example: '7745213-8',
    nullable: true,
    type: String,
    description: 'NIT',
  })
  taxId!: string | null;

  @ApiProperty({
    example: 'rcastillo@tquetzal.gt',
    nullable: true,
    type: String,
  })
  email!: string | null;

  @ApiProperty({ example: '+502 5566 4412', nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ nullable: true, type: String })
  notes!: string | null;

  @ApiProperty({ format: 'uuid', nullable: true, type: String })
  assignedUserId!: string | null;

  @ApiProperty({ type: AssignedUserDto, nullable: true })
  assignedUser!: AssignedUserDto | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'Lead del que se convirtió, si aplica',
  })
  sourceLeadId!: string | null;

  @ApiProperty({ example: true })
  active!: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Cliente desde',
  })
  creadoEn!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  actualizadoEn!: Date;
}
