import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Trim } from '../../../common/dto/trim.transform';

// No acepta projectId (lo fija la ruta) ni active (un producto nace activo).
export class CreateProductDto {
  @ApiProperty({ example: 'Licencia FlowCommerce Pro', maxLength: 255 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({
    example: 'Suscripción anual por usuario',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ example: 'Licencias', maxLength: 100, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @ApiPropertyOptional({ example: 'usuario', maxLength: 50, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string | null;

  @ApiProperty({
    example: 1450,
    minimum: 0,
    description: 'Precio unitario antes de IVA (2 decimales)',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(999999999999.99)
  price!: number;

  @ApiPropertyOptional({ example: 10, minimum: 0, maximum: 100, default: 0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  maxDiscountPercent?: number;
}
