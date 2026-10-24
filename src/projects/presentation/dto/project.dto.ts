import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@flowcommerce/types';

export class ProjectDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  slug!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  creadoEn!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  actualizadoEn!: Date;
}

export class ProjectBillingDto {
  @ApiPropertyOptional({ nullable: true })
  legalName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  taxId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  address!: string | null;

  @ApiPropertyOptional({ nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  email!: string | null;
}

export class ProjectQuoteSettingsDto {
  @ApiProperty({ example: 12 })
  taxPercent!: number;

  @ApiProperty({ example: 'COT' })
  folioPrefix!: string;

  @ApiProperty({ example: 30 })
  validityDays!: number;

  @ApiPropertyOptional({ nullable: true })
  defaultTerms!: string | null;

  @ApiProperty({ example: 'GTQ' })
  currency!: string;
}

export class ProjectDetailDto extends ProjectDto {
  @ApiProperty({ type: ProjectBillingDto })
  billing!: ProjectBillingDto;

  @ApiProperty({ type: ProjectQuoteSettingsDto })
  quoteSettings!: ProjectQuoteSettingsDto;
}

export class UserProjectDto extends ProjectDto {
  @ApiProperty({ enum: Role })
  role!: Role;
}
