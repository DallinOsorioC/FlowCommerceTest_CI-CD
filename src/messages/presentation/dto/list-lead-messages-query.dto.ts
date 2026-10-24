import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

// Paginación por cursor del chat: primera carga sin `before` (los más
// recientes); al hacer scroll hacia arriba, `before` = nextCursor recibido.
export class ListLeadMessagesQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Devuelve los mensajes anteriores a este (valor de nextCursor)',
  })
  @IsOptional()
  @IsUUID()
  before?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}
