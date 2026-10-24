import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import { buildPaginationMeta } from '../../../common/dto/pagination.dto';
import { CreateQuoteUseCase } from '../../application/use-cases/create-quote.use-case';
import { DeleteQuoteUseCase } from '../../application/use-cases/delete-quote.use-case';
import { GetQuoteUseCase } from '../../application/use-cases/get-quote.use-case';
import { ListQuotesUseCase } from '../../application/use-cases/list-quotes.use-case';
import { UpdateQuoteStatusUseCase } from '../../application/use-cases/update-quote-status.use-case';
import { UpdateQuoteUseCase } from '../../application/use-cases/update-quote.use-case';
import {
  GetQuotePdfUseCase,
  SendQuoteUseCase,
} from '../../application/use-cases/quote-document.use-cases';
import { SendQuoteDto } from '../dto/send-quote.dto';
import { CreateQuoteDto } from '../dto/create-quote.dto';
import { ListQuotesQueryDto } from '../dto/list-quotes-query.dto';
import { PaginatedQuotesDto } from '../dto/paginated-quotes.dto';
import { QuoteDetailDto } from '../dto/quote.dto';
import { UpdateQuoteStatusDto } from '../dto/update-quote-status.dto';
import { UpdateQuoteDto } from '../dto/update-quote.dto';

const toDate = (value: string | null | undefined): Date | null | undefined =>
  value === undefined || value === null ? value : new Date(value);

// Cotizaciones del tenant. Los guards de clase fijan autenticación y acceso
// por proyecto; cada handler declara su permiso con @RequirePermission.
// El projectId se toma siempre de la ruta, nunca del body ni del query.
@ApiTags('quotes')
@Controller({ path: 'projects/:projectId/quotes', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
@ApiUnauthorizedResponse({ description: 'Sin sesión activa' })
@ApiForbiddenResponse({
  description: 'Sin el permiso requerido en el proyecto (o proyecto ajeno)',
})
export class QuotesController {
  constructor(
    private readonly createQuoteUseCase: CreateQuoteUseCase,
    private readonly listQuotesUseCase: ListQuotesUseCase,
    private readonly getQuoteUseCase: GetQuoteUseCase,
    private readonly updateQuoteUseCase: UpdateQuoteUseCase,
    private readonly deleteQuoteUseCase: DeleteQuoteUseCase,
    private readonly updateQuoteStatusUseCase: UpdateQuoteStatusUseCase,
    private readonly getQuotePdfUseCase: GetQuotePdfUseCase,
    private readonly sendQuoteUseCase: SendQuoteUseCase,
  ) {}

  @Post()
  @RequirePermission(Permission.QUOTE_CREATE)
  @ApiOperation({
    summary: 'Crear una cotización en borrador',
    description:
      'El folio es correlativo y los precios salen del catálogo: el body solo lleva producto, cantidad y descuento por partida.',
  })
  @ApiCreatedResponse({ type: QuoteDetailDto })
  @ApiBadRequestResponse({
    description: 'Body inválido o descuento por encima del máximo del producto',
  })
  @ApiNotFoundResponse({
    description: 'Lead, cliente o producto inexistente en este proyecto',
  })
  @ApiConflictResponse({ description: 'Producto inactivo' })
  createQuote(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateQuoteDto,
  ): Promise<QuoteDetailDto> {
    return this.createQuoteUseCase
      .execute({
        actorUserId: userId,
        projectId,
        leadId: dto.leadId,
        clientId: dto.clientId,
        validUntil: toDate(dto.validUntil),
        notes: dto.notes,
        terms: dto.terms,
        items: dto.items,
        adjustment: dto.adjustment,
      })
      .then((quote) => quote.toDetail());
  }

  @Get()
  @RequirePermission(Permission.QUOTE_READ)
  @ApiOperation({
    summary: 'Listar cotizaciones',
    description:
      'Con resumen {id, name} del lead y del cliente y los datos del asesor. Busca por folio o por nombre del lead/cliente; filtra por estado, cliente, lead, asesor (createdByUserId), origen y fechas; ordena por fecha, total o folio. meta.sumTotal = suma del filtro.',
  })
  @ApiOkResponse({ type: PaginatedQuotesDto })
  async listQuotes(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: ListQuotesQueryDto,
  ): Promise<PaginatedQuotesDto> {
    const result = await this.listQuotesUseCase.execute({
      actorUserId: userId,
      projectId,
      status: query.status,
      clientId: query.clientId,
      leadId: query.leadId,
      createdByUserId: query.createdByUserId,
      origin: query.origin,
      search: query.search,
      from: query.createdFrom ? new Date(query.createdFrom) : undefined,
      to: query.createdTo ? new Date(query.createdTo) : undefined,
      sortBy: query.sortBy,
      order: query.order,
      page: query.page,
      limit: query.limit,
    });

    return {
      data: result.quotes.map((quote) => quote.toQuote()),
      meta: {
        ...buildPaginationMeta(query.page, query.limit, result.total),
        sumTotal: result.sumTotal,
      },
    };
  }

  // Una cotización de otro tenant responde 404, igual que una inexistente.
  @Get(':quoteId')
  @RequirePermission(Permission.QUOTE_READ)
  @ApiOperation({ summary: 'Ver una cotización con sus partidas' })
  @ApiOkResponse({ type: QuoteDetailDto })
  @ApiNotFoundResponse({ description: 'No existe en este proyecto' })
  getQuote(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
  ): Promise<QuoteDetailDto> {
    return this.getQuoteUseCase
      .execute({ actorUserId: userId, projectId, quoteId })
      .then((quote) => quote.toDetail());
  }

  @Patch(':quoteId')
  @RequirePermission(Permission.QUOTE_CREATE)
  @ApiOperation({
    summary: 'Editar un borrador',
    description:
      'Solo en DRAFT. Si se envían `items` reemplazan a todas las partidas y se recalculan los importes.',
  })
  @ApiOkResponse({ type: QuoteDetailDto })
  @ApiNotFoundResponse({ description: 'No existe en este proyecto' })
  @ApiConflictResponse({ description: 'La cotización ya no está en DRAFT' })
  updateQuote(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Body() dto: UpdateQuoteDto,
  ): Promise<QuoteDetailDto> {
    return this.updateQuoteUseCase
      .execute({
        actorUserId: userId,
        projectId,
        quoteId,
        clientId: dto.clientId,
        validUntil: toDate(dto.validUntil),
        notes: dto.notes,
        terms: dto.terms,
        items: dto.items,
        adjustment: dto.adjustment,
      })
      .then((quote) => quote.toDetail());
  }

  @Delete(':quoteId')
  @RequirePermission(Permission.QUOTE_CREATE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Borrar un borrador' })
  @ApiNoContentResponse({ description: 'Cotización borrada' })
  @ApiNotFoundResponse({ description: 'No existe en este proyecto' })
  @ApiConflictResponse({ description: 'La cotización ya no está en DRAFT' })
  async deleteQuote(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
  ): Promise<void> {
    await this.deleteQuoteUseCase.execute({
      actorUserId: userId,
      projectId,
      quoteId,
    });
  }

  // Cualquier cambio de estado es una escritura, así que el guard exige
  // QUOTE_CREATE. El use-case decide además si el estado destino necesita
  // QUOTE_APPROVE (aprobar y pagar): el permiso depende de a dónde se mueve la
  // cotización, no del endpoint.
  @Patch(':quoteId/status')
  @RequirePermission(Permission.QUOTE_CREATE)
  @ApiOperation({
    summary: 'Cambiar el estado de una cotización',
    description:
      'DRAFT → PENDING_APPROVAL → APPROVED → SENT → ACCEPTED → PAID; PENDING_APPROVAL → DRAFT; SENT → REJECTED. La transición es atómica.',
  })
  @ApiOkResponse({ type: QuoteDetailDto })
  @ApiNotFoundResponse({ description: 'No existe en este proyecto' })
  @ApiConflictResponse({
    description: 'Transición inválida o el estado cambió en paralelo',
  })
  updateQuoteStatus(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Body() dto: UpdateQuoteStatusDto,
  ): Promise<QuoteDetailDto> {
    return this.updateQuoteStatusUseCase
      .execute({
        actorUserId: userId,
        projectId,
        quoteId,
        status: dto.status,
      })
      .then((quote) => quote.toDetail());
  }

  // Vista previa / descarga del PDF. ?download=true lo descarga en vez de
  // abrirlo en el navegador.
  @Get(':quoteId/pdf')
  @RequirePermission(Permission.QUOTE_READ)
  @ApiOperation({
    summary: 'PDF de la cotización',
    description:
      'Incluye datos de facturación del proyecto, cliente, asesor, partidas, totales (con ajuste comercial e IVA) y condiciones.',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: 'No existe en este proyecto' })
  async getPdf(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const pdf = await this.getQuotePdfUseCase.execute({
      actorUserId: userId,
      projectId,
      quoteId,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download === 'true' ? 'attachment' : 'inline'}; filename="${pdf.filename}"`,
      'Cache-Control': 'no-store',
    });
    return new StreamableFile(pdf.content);
  }

  // "Aprobar y enviar": correo al cliente con el PDF adjunto. Si estaba
  // APPROVED pasa a SENT; si ya estaba SENT, es un reenvío.
  @Post(':quoteId/send')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.QUOTE_CREATE)
  @ApiOperation({
    summary: 'Enviar la cotización por correo',
    description:
      'Solo APPROVED (pasa a SENT) o SENT (reenvío). Sin "to" se usa el email del cliente o del lead.',
  })
  @ApiOkResponse({ type: QuoteDetailDto })
  @ApiBadRequestResponse({ description: 'Sin destinatario' })
  @ApiConflictResponse({ description: 'La cotización no está aprobada' })
  sendQuote(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Body() dto: SendQuoteDto,
  ): Promise<QuoteDetailDto> {
    return this.sendQuoteUseCase
      .execute({
        actorUserId: userId,
        projectId,
        quoteId,
        to: dto.to,
        cc: dto.cc,
        message: dto.message,
      })
      .then((quote) => quote.toDetail());
  }
}
