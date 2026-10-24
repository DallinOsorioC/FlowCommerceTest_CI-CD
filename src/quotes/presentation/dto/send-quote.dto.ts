import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SendQuoteDto {
  @ApiPropertyOptional({
    example: 'cliente@empresa.com',
    description:
      'Destinatario. Si se omite, el email del cliente (o del lead).',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  to?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsEmail({}, { each: true })
  cc?: string[];

  @ApiPropertyOptional({
    maxLength: 2000,
    description: 'Mensaje personalizado del correo (si no, uno por defecto)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
