import { ApiProperty } from '@nestjs/swagger';

export class WhatsAppTemplateDto {
  @ApiProperty({ example: 'seguimiento_cotizacion' })
  name!: string;

  @ApiProperty({ example: 'es' })
  language!: string;

  @ApiProperty({
    example: 'UTILITY',
    description: 'MARKETING, UTILITY o AUTHENTICATION',
  })
  category!: string;

  @ApiProperty({ example: 'APPROVED' })
  status!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    example: 'Hola {{1}}, ¿pudo revisar la cotización {{2}}?',
  })
  bodyText!: string | null;

  @ApiProperty({ example: 2, description: 'Cuántos parámetros hay que enviar' })
  bodyParameterCount!: number;

  @ApiProperty({
    example: false,
    description:
      'true = el encabezado necesita datos (imagen/documento/variables): no se puede enviar desde el CRM',
  })
  headerNeedsParameters!: boolean;
}
