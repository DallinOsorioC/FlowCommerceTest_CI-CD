import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { LeadStage } from '@flowcommerce/types';
import { CreateLeadUseCase } from '../../../leads/application/use-cases/create-lead.use-case';
import { CreateLeadDto } from '../../../leads/presentation/dto/create-lead.dto';
import { LeadDto } from '../../../leads/presentation/dto/lead.dto';
import { ProductDto } from '../../../products/presentation/dto/product.dto';
import { CreateQuoteUseCase } from '../../../quotes/application/use-cases/create-quote.use-case';
import { CreateQuoteDto } from '../../../quotes/presentation/dto/create-quote.dto';
import { QuoteDetailDto } from '../../../quotes/presentation/dto/quote.dto';
import {
  GetLeadContextForAiUseCase,
  ListCatalogForAiUseCase,
} from '../../application/ai-context.use-case';
import { ApiKeyScope, type ApiKeyPrincipal } from '../../domain/api-key';
import { AiLeadContextDto } from '../dto/integrations.dto';
import {
  ApiKeyGuard,
  CurrentIntegration,
  RequireScope,
} from '../guards/api-key.guard';

const toDate = (value: string | null | undefined): Date | null | undefined =>
  value === undefined || value === null ? value : new Date(value);

// Endpoints para el servicio del equipo de IA. Se autentican con la API key
// del proyecto (no con la sesión de un usuario). Los leads y cotizaciones que crea
// quedan con origin = AI («Generada por IA» en el frontend y en el PDF) y
// pasan por las MISMAS reglas que los del CRM: precios del catálogo,
// descuentos máximos, cotización en DRAFT para que una persona la revise.
@ApiTags('integrations')
@Controller({ path: 'integrations/ai', version: '1' })
@UseGuards(ApiKeyGuard)
@ApiHeader({
  name: 'Authorization',
  description: 'Bearer fc_live_… (API key del proyecto)',
  required: true,
})
@ApiUnauthorizedResponse({ description: 'Sin API key, inválida o revocada' })
@ApiForbiddenResponse({
  description: 'La API key no tiene el scope de la ruta',
})
export class AiIntegrationController {
  constructor(
    private readonly getLeadContext: GetLeadContextForAiUseCase,
    private readonly listCatalog: ListCatalogForAiUseCase,
    private readonly createLeadUseCase: CreateLeadUseCase,
    private readonly createQuoteUseCase: CreateQuoteUseCase,
  ) {}

  @Get('catalog')
  @RequireScope(ApiKeyScope.CATALOG_READ)
  @ApiOperation({
    summary: 'Productos activos del proyecto (para armar partidas)',
  })
  @ApiOkResponse({ type: [ProductDto] })
  async catalog(
    @CurrentIntegration() integration: ApiKeyPrincipal,
  ): Promise<ProductDto[]> {
    const products = await this.listCatalog.execute({
      actorUserId: integration.actorUserId,
      projectId: integration.projectId,
    });
    return products.map((product) => product.toProduct());
  }

  @Get('leads/:leadId/context')
  @RequireScope(ApiKeyScope.LEADS_READ)
  @ApiOperation({
    summary: 'Contexto de un lead para la IA',
    description:
      'El lead, sus últimos 30 mensajes de WhatsApp y sus últimas 20 cotizaciones.',
  })
  @ApiOkResponse({ type: AiLeadContextDto })
  @ApiNotFoundResponse({ description: 'El lead no es de este proyecto' })
  async leadContext(
    @CurrentIntegration() integration: ApiKeyPrincipal,
    @Param('leadId', ParseUUIDPipe) leadId: string,
  ): Promise<AiLeadContextDto> {
    const context = await this.getLeadContext.execute({
      actorUserId: integration.actorUserId,
      projectId: integration.projectId,
      leadId,
    });
    return {
      lead: context.lead.toLead(),
      messages: context.messages.map((message) => message.toMessage()),
      quotes: context.quotes.map((quote) => quote.toQuote()),
    };
  }

  @Post('leads')
  @RequireScope(ApiKeyScope.LEADS_WRITE)
  @ApiOperation({
    summary: 'Registrar un lead detectado por la IA',
    description:
      'Mismo body que POST /projects/:projectId/leads. Queda con origin = AI.',
  })
  @ApiCreatedResponse({ type: LeadDto })
  createLead(
    @CurrentIntegration() integration: ApiKeyPrincipal,
    @Body() dto: CreateLeadDto,
  ): Promise<LeadDto> {
    return this.createLeadUseCase
      .execute({
        actorUserId: integration.actorUserId,
        projectId: integration.projectId,
        name: dto.name,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        stage: dto.stage ?? LeadStage.NEW,
        score: dto.score ?? 0,
        company: dto.company ?? null,
        contactPosition: dto.contactPosition ?? null,
        source: dto.source ?? null,
        estimatedValue: dto.estimatedValue ?? null,
        notes: dto.notes ?? null,
        assignedUserId: dto.assignedUserId ?? null,
        clientId: dto.clientId ?? null,
        interestProductId: dto.interestProductId ?? null,
        lastContactAt: toDate(dto.lastContactAt) ?? null,
        origin: 'AI',
      })
      .then((lead) => lead.toLead());
  }

  @Post('quotes')
  @RequireScope(ApiKeyScope.QUOTES_WRITE)
  @ApiOperation({
    summary: 'Crear una cotización sugerida por la IA',
    description:
      'Mismo body que POST /projects/:projectId/quotes. Queda en DRAFT con origin = AI: una persona la revisa y la manda a aprobación.',
  })
  @ApiCreatedResponse({ type: QuoteDetailDto })
  createQuote(
    @CurrentIntegration() integration: ApiKeyPrincipal,
    @Body() dto: CreateQuoteDto,
  ): Promise<QuoteDetailDto> {
    return this.createQuoteUseCase
      .execute({
        actorUserId: integration.actorUserId,
        projectId: integration.projectId,
        leadId: dto.leadId,
        clientId: dto.clientId,
        validUntil: toDate(dto.validUntil),
        notes: dto.notes,
        terms: dto.terms,
        items: dto.items,
        adjustment: dto.adjustment,
        origin: 'AI',
      })
      .then((quote) => quote.toDetail());
  }
}
