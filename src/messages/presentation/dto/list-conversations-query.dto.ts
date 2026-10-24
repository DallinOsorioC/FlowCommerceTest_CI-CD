import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { BooleanQuery } from '../../../common/dto/boolean-query.transform';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class ListConversationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Busca en nombre, teléfono o empresa del lead',
    example: 'Ana',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  search?: string;

  @ApiPropertyOptional({
    description: 'true = solo conversaciones con mensajes sin leer',
  })
  @IsOptional()
  @BooleanQuery()
  @IsBoolean()
  unread?: boolean;
}
