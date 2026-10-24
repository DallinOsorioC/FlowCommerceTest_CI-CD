import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BadGatewayException,
  ServiceUnavailableException,
} from '../../../common/exceptions/domain.exceptions';
import type {
  CreatePaymentLinkInput,
  PaymentLink,
  PaymentsGateway,
} from '../../domain/payments';

// Cliente HTTP del servicio del equipo de Pagos (Stripe por detrás):
//   POST {PAYMENTS_SERVICE_URL}/payment-links
//   Authorization: Bearer {PAYMENTS_SERVICE_TOKEN}
//   Idempotency-Key: <quoteId>   (pedirlo dos veces devuelve el mismo link)
// Respuesta esperada: { "url": "https://...", "id": "plink_..." }
@Injectable()
export class HttpPaymentsGateway implements PaymentsGateway {
  private readonly logger = new Logger(HttpPaymentsGateway.name);

  constructor(private readonly configService: ConfigService) {}

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<PaymentLink> {
    const baseUrl = this.configService.get<string>('PAYMENTS_SERVICE_URL');
    const token = this.configService.get<string>('PAYMENTS_SERVICE_TOKEN');
    if (!baseUrl || !token) {
      throw new ServiceUnavailableException(
        'The payments service is not configured (PAYMENTS_SERVICE_URL / PAYMENTS_SERVICE_TOKEN)',
      );
    }

    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}/payment-links`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': input.quoteId,
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      this.logger.error(`Payments service unreachable: ${String(error)}`);
      throw new BadGatewayException('The payments service is unreachable');
    }

    const payload = (await response.json().catch(() => ({}))) as {
      url?: string;
      id?: string;
      message?: string;
    };
    if (!response.ok || !payload.url || !/^https:\/\//i.test(payload.url)) {
      this.logger.error(
        `Payments service answered ${response.status}: ${payload.message ?? 'no url'}`,
      );
      throw new BadGatewayException(
        'The payments service could not create the link',
      );
    }
    return { url: payload.url, providerReference: payload.id ?? null };
  }
}
