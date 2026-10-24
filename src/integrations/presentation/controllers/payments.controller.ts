import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiConflictResponse,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Permission } from '@flowcommerce/types';
import { AuthenticatedGuard } from '../../../auth/presentation/guards/authenticated.guard';
import { CurrentUserId } from '../../../auth/presentation/decorators/current-user.decorator';
import { ProjectPermissionGuard } from '../../../authorization/presentation/guards/project-permission.guard';
import { RequirePermission } from '../../../authorization/presentation/decorators/require-permission.decorator';
import { QuoteDetailDto } from '../../../quotes/presentation/dto/quote.dto';
import {
  CreatePaymentLinkUseCase,
  HandlePaymentWebhookUseCase,
} from '../../application/payments.use-cases';
import { PaymentWebhookResponseDto } from '../dto/integrations.dto';

// Botón «Generar link de pago» de una cotización aceptada.
@ApiTags('quotes')
@Controller({ path: 'projects/:projectId/quotes', version: '1' })
@UseGuards(AuthenticatedGuard, ProjectPermissionGuard)
export class PaymentLinkController {
  constructor(private readonly createPaymentLink: CreatePaymentLinkUseCase) {}

  // POST porque crea el link en el servicio de Pagos. Idempotente: si ya
  // existe, devuelve la misma cotización con el mismo link.
  @Post(':quoteId/payment-link')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(Permission.QUOTE_CREATE)
  @ApiOperation({
    summary: 'Generar el link de pago',
    description:
      'Solo cotizaciones ACCEPTED. El link lo crea el servicio de Pagos; el pago confirmado llega por su webhook y pasa la cotización a PAID.',
  })
  @ApiOkResponse({ type: QuoteDetailDto })
  @ApiConflictResponse({ description: 'La cotización no está aceptada' })
  @ApiServiceUnavailableResponse({ description: 'Pagos no está configurado' })
  create(
    @CurrentUserId() userId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
  ): Promise<QuoteDetailDto> {
    return this.createPaymentLink
      .execute({ actorUserId: userId, projectId, quoteId })
      .then((quote) => quote.toDetail());
  }
}

// Webhook del servicio de Pagos. Público: la firma HMAC es la autenticación.
@ApiTags('integrations')
@Controller({ path: 'integrations/payments', version: '1' })
export class PaymentsWebhookController {
  constructor(private readonly handleWebhook: HandlePaymentWebhookUseCase) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  @ApiOkResponse({ type: PaymentWebhookResponseDto })
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-flowcommerce-signature') signature: string | undefined,
  ): Promise<PaymentWebhookResponseDto> {
    const result = await this.handleWebhook.execute({
      rawBody: request.rawBody,
      signatureHeader: signature,
      payload: request.body,
    });
    return { received: true, result };
  }
}
