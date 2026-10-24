import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { LeadStage, Permission, QuoteStatus } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../authorization/presentation/decorators/require-permission.decorator';
import { Trim } from '../../common/dto/trim.transform';
import { GlobalSearchUseCase } from '../application/global-search.use-case';

export class SearchQueryDto {
  @ApiProperty({ minLength: 2, maxLength: 64, example: 'quetzal' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(64)
  q!: string;

  @ApiPropertyOptional({ default: 5, minimum: 1, maximum: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 5;
}

class SearchLeadDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) company!: string | null;
  @ApiProperty({ enum: LeadStage }) stage!: LeadStage;
}

class SearchClientDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: String, nullable: true }) company!: string | null;
  @ApiProperty({ type: String, nullable: true }) taxId!: string | null;
}

class SearchQuoteDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'COT-000028' }) folio!: string;
  @ApiProperty({ enum: QuoteStatus }) status!: QuoteStatus;
  @ApiProperty({ example: 1120 }) total!: number;
  @ApiProperty({ description: 'Cliente, o lead si no tiene cliente' })
  customerName!: string;
}

export class SearchResultsDto {
  @ApiProperty({ type: [SearchLeadDto] }) leads!: SearchLeadDto[];
  @ApiProperty({ type: [SearchClientDto] }) clients!: SearchClientDto[];
  @ApiProperty({ type: [SearchQuoteDto] }) quotes!: SearchQuoteDto[];
}

@ApiTags('search')
@Controller({ path: 'projects/:projectId/search', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class SearchController {
  constructor(private readonly globalSearch: GlobalSearchUseCase) {}

  @Get()
  @RequirePermission(Permission.PROJECT_READ)
  @ApiOperation({
    summary: 'Búsqueda global (⌘K)',
    description:
      'Busca leads (nombre, empresa, email, teléfono), clientes (nombre, empresa, email, NIT) y cotizaciones (folio, nombre del cliente o lead). Hasta `limit` resultados por tipo.',
  })
  @ApiOkResponse({ type: SearchResultsDto })
  search(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: SearchQueryDto,
  ): Promise<SearchResultsDto> {
    return this.globalSearch.execute({
      actorUserId: userId,
      projectId,
      q: query.q,
      limit: query.limit,
    });
  }
}
