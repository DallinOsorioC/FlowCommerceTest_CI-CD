import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CreatedWhatsAppTemplate,
  DownloadedWhatsAppMedia,
  SendWhatsAppMessageResult,
  WhatsAppGateway,
  WhatsAppTemplate,
} from '../../domain/ports/whatsapp.gateway';

// PNG de 1×1 px: lo que "descarga" el stub cuando llega una imagen.
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// Doble de prueba del puerto de WhatsApp. El módulo de producción usa
// CloudWhatsAppGateway; este stub solo se inyecta en E2E para no llamar a
// Graph API. Devuelve un wamid sintético que cumple NOT NULL y el único.
@Injectable()
export class StubWhatsAppGateway implements WhatsAppGateway {
  send(): Promise<SendWhatsAppMessageResult> {
    return Promise.resolve(this.sent());
  }

  sendTemplate(): Promise<SendWhatsAppMessageResult> {
    return Promise.resolve(this.sent());
  }

  sendMedia(): Promise<SendWhatsAppMessageResult> {
    return Promise.resolve(this.sent());
  }

  // Las dos plantillas típicas de una cuenta de prueba.
  listTemplates(): Promise<WhatsAppTemplate[]> {
    return Promise.resolve([
      {
        name: 'hello_world',
        language: 'en_US',
        category: 'UTILITY',
        status: 'APPROVED',
        bodyText: 'Welcome and congratulations!!',
        bodyParameterCount: 0,
        headerNeedsParameters: false,
      },
      {
        name: 'seguimiento_cotizacion',
        language: 'es',
        category: 'UTILITY',
        status: 'APPROVED',
        bodyText: 'Hola {{1}}, ¿pudo revisar la cotización {{2}}?',
        bodyParameterCount: 2,
        headerNeedsParameters: false,
      },
    ]);
  }

  verifyCredentials(): Promise<void> {
    return Promise.resolve();
  }

  createTemplate(): Promise<CreatedWhatsAppTemplate> {
    return Promise.resolve({ id: `stub-${randomUUID()}`, status: 'PENDING' });
  }

  deleteTemplate(): Promise<void> {
    return Promise.resolve();
  }

  downloadMedia(): Promise<DownloadedWhatsAppMedia | null> {
    return Promise.resolve({ content: ONE_PIXEL_PNG, mimeType: 'image/png' });
  }

  private sent(): SendWhatsAppMessageResult {
    return { whatsappMessageId: `wamid.stub.${randomUUID()}`, status: 'SENT' };
  }
}
