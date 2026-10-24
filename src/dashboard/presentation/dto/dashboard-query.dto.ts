import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional } from 'class-validator';

// Filtro opcional de GET /dashboard. Intervalo semiabierto [from, to):
// "este mes" = ?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z.
// Deben ir juntos; sin ninguno, el Dashboard es histórico (como antes).
export class DashboardQueryDto {
  @ApiPropertyOptional({
    format: 'date-time',
    example: '2026-10-01T00:00:00Z',
    description: 'Inicio del período (inclusive)',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    example: '2026-11-01T00:00:00Z',
    description: 'Fin del período (exclusivo). Máximo 366 días después de from',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
