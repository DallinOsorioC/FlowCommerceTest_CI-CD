import {
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { HandleWhatsAppWebhookUseCase } from '../../application/use-cases/handle-whatsapp-webhook.use-case';

// Callback público de Meta. No lleva AuthenticatedGuard: la autenticación es
// el verify token (GET) y la firma HMAC (POST). El tenant se resuelve con
// WHATSAPP_PROJECT_ID, no con un parámetro de ruta que un tercero pueda forjar.
@ApiExcludeController()
@Controller({
  path: 'webhooks/whatsapp',
  version: '1',
})
export class WhatsAppWebhookController {
  constructor(
    private readonly handleWhatsAppWebhookUseCase: HandleWhatsAppWebhookUseCase,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() response: Response,
  ): void {
    const value = this.handleWhatsAppWebhookUseCase.verifyChallenge(
      mode,
      token,
      challenge,
    );
    response.status(200).contentType('text/plain').send(value);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
  ): Promise<{ success: true }> {
    if (!request.rawBody) {
      throw new ForbiddenException('Invalid WhatsApp webhook signature');
    }

    await this.handleWhatsAppWebhookUseCase.execute({
      rawBody: request.rawBody,
      signatureHeader: signature,
      payload: request.body,
    });

    return { success: true };
  }
}
