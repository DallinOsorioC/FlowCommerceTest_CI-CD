import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class SaveWhatsAppConfigDto {
  @ApiProperty({
    example: '123456789012345',
    description: 'phone_number_id de Meta (no el número de teléfono)',
  })
  @IsString()
  @Matches(/^\d{5,30}$/, { message: 'phoneNumberId must be numeric' })
  phoneNumberId!: string;

  @ApiPropertyOptional({
    example: '109876543210987',
    description: 'Id de la cuenta de WhatsApp Business (WABA): plantillas',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{5,30}$/, { message: 'businessAccountId must be numeric' })
  businessAccountId?: string;

  @ApiProperty({
    description:
      'Token permanente de la Cloud API. Se guarda cifrado y nunca se devuelve.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  token!: string;
}

export class WhatsAppConfigDto {
  @ApiProperty() connected!: boolean;

  @ApiProperty({ enum: ['project', 'environment', 'none'] })
  source!: 'project' | 'environment' | 'none';

  @ApiProperty({ type: String, nullable: true }) phoneNumberId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  businessAccountId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Últimos 4 caracteres del token, para reconocerlo',
  })
  tokenLast4!: string | null;

  @ApiProperty({ type: Date, nullable: true }) updatedAt!: Date | null;
}

export class CreateWhatsAppTemplateDto {
  @ApiProperty({
    example: 'seguimiento_cotizacion',
    description: 'Minúsculas, dígitos y guion bajo',
  })
  @IsString()
  @Matches(/^[a-z0-9_]{1,512}$/, {
    message: 'name must be lowercase letters, digits and underscores',
  })
  name!: string;

  @ApiProperty({ example: 'es' })
  @IsString()
  @Matches(/^[a-z]{2}(_[A-Z]{2})?$/, {
    message: 'language must look like es or es_MX',
  })
  language!: string;

  @ApiProperty({ enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'] })
  @IsIn(['MARKETING', 'UTILITY', 'AUTHENTICATION'])
  category!: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

  @ApiProperty({ example: 'Hola {{1}}, ¿pudo revisar la cotización {{2}}?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  bodyText!: string;

  @ApiPropertyOptional({
    type: [String],
    example: ['Ana', 'COT-0012'],
    description: 'Un ejemplo por cada variable {{n}} (lo exige Meta)',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  bodyExamples?: string[];
}

export class CreatedWhatsAppTemplateDto {
  @ApiProperty() id!: string;

  @ApiProperty({ example: 'PENDING' }) status!: string;
}
