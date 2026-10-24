import { ApiProperty } from '@nestjs/swagger';

export class ProductDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  projectId!: string;

  @ApiProperty({ example: 'Licencia FlowCommerce Pro' })
  name!: string;

  @ApiProperty({
    example: 'Suscripción anual por usuario',
    nullable: true,
    type: String,
  })
  description!: string | null;

  @ApiProperty({ example: 'Licencias', nullable: true, type: String })
  category!: string | null;

  @ApiProperty({ example: 'usuario', nullable: true, type: String })
  unit!: string | null;

  @ApiProperty({ example: 1450, description: 'Precio unitario antes de IVA' })
  price!: number;

  @ApiProperty({
    example: 10,
    description: 'Descuento máximo permitido al cotizar (%)',
  })
  maxDiscountPercent!: number;

  @ApiProperty({
    example: true,
    description:
      'false = desactivado: no se puede agregar a cotizaciones nuevas',
  })
  active!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  creadoEn!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  actualizadoEn!: Date;
}
