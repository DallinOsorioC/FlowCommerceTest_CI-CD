import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BadGatewayException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} from '../../../common/exceptions/domain.exceptions';
import { WhatsAppCredentialsResolver } from './whatsapp-credentials.resolver';
import {
  countTemplateParameters,
  type DownloadedWhatsAppMedia,
  type SendWhatsAppMediaInput,
  type SendWhatsAppMessageInput,
  type SendWhatsAppMessageResult,
  type CreateWhatsAppTemplateInput,
  type CreatedWhatsAppTemplate,
  type SendWhatsAppTemplateInput,
  type VerifyWhatsAppCredentialsInput,
  type WhatsAppGateway,
  type WhatsAppTemplate,
} from '../../domain/ports/whatsapp.gateway';
import { normalizeWhatsAppPhone } from './normalize-phone';
import { isRetryableHttpStatus, retryDelayMs, sleep } from './retry';

export const WHATSAPP_FETCH = Symbol('WHATSAPP_FETCH');

interface GraphError {
  message?: string;
  code?: number;
}

interface GraphMessageResponse {
  messages?: Array<{ id?: string }>;
  error?: GraphError;
}

interface GraphTemplateComponent {
  type?: string;
  format?: string;
  text?: string;
}

interface GraphTemplatesResponse {
  data?: Array<{
    name?: string;
    language?: string;
    status?: string;
    category?: string;
    components?: GraphTemplateComponent[];
  }>;
  error?: GraphError;
}

interface GraphMediaInfo {
  url?: string;
  mime_type?: string;
  file_size?: number;
  error?: GraphError;
}

interface GraphConfig {
  token: string;
  phoneNumberId: string;
  businessAccountId: string | null;
  baseUrl: string;
}

// Cliente real de WhatsApp Cloud API (Graph). Las credenciales las decide
// WhatsAppCredentialsResolver: la cuenta cifrada del proyecto o, si no tiene,
// las variables de entorno (con WHATSAPP_PROJECT_ID atando el número a un
// único tenant).
@Injectable()
export class CloudWhatsAppGateway implements WhatsAppGateway {
  private readonly logger = new Logger(CloudWhatsAppGateway.name);
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly configService: ConfigService,
    @Optional()
    @Inject(WHATSAPP_FETCH)
    fetchImpl?: typeof fetch,
    @Optional() private readonly credentials?: WhatsAppCredentialsResolver,
  ) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  async send(
    input: SendWhatsAppMessageInput,
  ): Promise<SendWhatsAppMessageResult> {
    const config = await this.configFor(input.projectId);
    const to = this.destination(input.phone);
    return this.postMessage(config, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body: input.content,
      },
    });
  }

  // Solo variables del cuerpo ({{1}}, {{2}}…), que es lo que usan las
  // plantillas de seguimiento y de recordatorio.
  async sendTemplate(
    input: SendWhatsAppTemplateInput,
  ): Promise<SendWhatsAppMessageResult> {
    const config = await this.configFor(input.projectId);
    const to = this.destination(input.phone);
    return this.postMessage(config, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.language },
        ...(input.bodyParameters.length > 0
          ? {
              components: [
                {
                  type: 'body',
                  parameters: input.bodyParameters.map((text) => ({
                    type: 'text',
                    text,
                  })),
                },
              ],
            }
          : {}),
      },
    });
  }

  // Dos pasos: subir el archivo (POST /<phone-id>/media → id) y enviar el
  // mensaje que lo cita. El archivo nunca se expone por una URL pública.
  async sendMedia(
    input: SendWhatsAppMediaInput,
  ): Promise<SendWhatsAppMessageResult> {
    const config = await this.configFor(input.projectId);
    const to = this.destination(input.phone);

    const uploaded = (await this.graphRequest(
      `${config.baseUrl}/${config.phoneNumberId}/media`,
      () => {
        const form = new FormData();
        form.append('messaging_product', 'whatsapp');
        form.append('type', input.mimeType);
        form.append(
          'file',
          new Blob([new Uint8Array(input.content)], { type: input.mimeType }),
          input.fileName,
        );
        return {
          method: 'POST',
          headers: { Authorization: `Bearer ${config.token}` },
          body: form,
        };
      },
    )) as { id?: string };
    if (!uploaded.id) {
      throw new BadGatewayException('WhatsApp did not return a media id');
    }

    const media: Record<string, string> = { id: uploaded.id };
    if (input.caption && input.kind !== 'audio') {
      media.caption = input.caption;
    }
    if (input.kind === 'document') {
      media.filename = input.fileName;
    }
    return this.postMessage(config, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: input.kind,
      [input.kind]: media,
    });
  }

  // GET /<WABA_ID>/message_templates. Requiere WHATSAPP_BUSINESS_ACCOUNT_ID
  // (el id de la cuenta de WhatsApp Business, no el del número).
  async listTemplates(
    projectId: string,
    options: { allStatuses?: boolean } = {},
  ): Promise<WhatsAppTemplate[]> {
    const config = await this.configFor(projectId);
    const wabaId = this.requireWabaId(config);
    const url = `${config.baseUrl}/${wabaId}/message_templates?fields=name,language,status,category,components&limit=100`;
    const payload = (await this.graphRequest(url, () => ({
      method: 'GET',
      headers: { Authorization: `Bearer ${config.token}` },
    }))) as GraphTemplatesResponse;

    return (payload.data ?? [])
      .filter(
        (item) =>
          item.name && (options.allStatuses || item.status === 'APPROVED'),
      )
      .map((item) => {
        const body = item.components?.find((c) => c.type === 'BODY');
        const header = item.components?.find((c) => c.type === 'HEADER');
        return {
          name: item.name!,
          language: item.language ?? 'es',
          category: item.category ?? 'UTILITY',
          status: item.status ?? 'UNKNOWN',
          bodyText: body?.text ?? null,
          bodyParameterCount: countTemplateParameters(body?.text),
          headerNeedsParameters: header
            ? header.format !== 'TEXT' ||
              countTemplateParameters(header.text) > 0
            : false,
        };
      });
  }

  // GET /<phone-number-id> con ese token: si Meta responde 200, el token
  // tiene acceso al número. Sin esto, cualquiera podría registrar el número de
  // otro proyecto y quedarse con sus mensajes entrantes.
  // WHATSAPP_SKIP_CREDENTIAL_CHECK=true lo omite (solo desarrollo y CI).
  async verifyCredentials(
    input: VerifyWhatsAppCredentialsInput,
  ): Promise<void> {
    if (
      this.configService.get<string>('WHATSAPP_SKIP_CREDENTIAL_CHECK') ===
      'true'
    ) {
      return;
    }
    const version =
      this.configService.get<string>('WHATSAPP_GRAPH_API_VERSION') ?? 'v21.0';
    const base =
      this.configService.get<string>('WHATSAPP_GRAPH_BASE_URL') ??
      'https://graph.facebook.com';
    await this.graphRequest(
      `${base.replace(/\/$/, '')}/${version}/${encodeURIComponent(input.phoneNumberId)}?fields=id`,
      () => ({
        method: 'GET',
        headers: { Authorization: `Bearer ${input.token}` },
      }),
    );
  }

  // POST /<WABA_ID>/message_templates. Meta la deja en PENDING hasta aprobarla.
  // Con WHATSAPP_TEMPLATES_DRY_RUN=true no llama a Meta (desarrollo y CI).
  async createTemplate(
    projectId: string,
    input: CreateWhatsAppTemplateInput,
  ): Promise<CreatedWhatsAppTemplate> {
    if (
      this.configService.get<string>('WHATSAPP_TEMPLATES_DRY_RUN') === 'true'
    ) {
      return { id: `dry-run-${randomUUID()}`, status: 'PENDING' };
    }
    const config = await this.configFor(projectId);
    const wabaId = this.requireWabaId(config);
    const body = countTemplateParameters(input.bodyText);
    const payload = (await this.graphRequest(
      `${config.baseUrl}/${wabaId}/message_templates`,
      () => ({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: input.name,
          language: input.language,
          category: input.category,
          components: [
            {
              type: 'BODY',
              text: input.bodyText,
              // Meta exige un ejemplo por cada variable {{n}}.
              ...(body > 0
                ? {
                    example: {
                      body_text: [
                        Array.from(
                          { length: body },
                          (_, index) => input.bodyExamples[index] ?? 'ejemplo',
                        ),
                      ],
                    },
                  }
                : {}),
            },
          ],
        }),
      }),
    )) as { id?: string; status?: string };
    if (!payload.id) {
      throw new ConflictException('WhatsApp did not return the template id');
    }
    return { id: payload.id, status: payload.status ?? 'PENDING' };
  }

  // DELETE /<WABA_ID>/message_templates?name=<nombre> (borra todos los idiomas).
  async deleteTemplate(projectId: string, name: string): Promise<void> {
    if (
      this.configService.get<string>('WHATSAPP_TEMPLATES_DRY_RUN') === 'true'
    ) {
      return;
    }
    const config = await this.configFor(projectId);
    const wabaId = this.requireWabaId(config);
    await this.graphRequest(
      `${config.baseUrl}/${wabaId}/message_templates?name=${encodeURIComponent(name)}`,
      () => ({
        method: 'DELETE',
        headers: { Authorization: `Bearer ${config.token}` },
      }),
    );
  }

  // GET /<media-id> da una URL temporal (y protegida con el token); luego se
  // descarga el archivo. Si WhatsApp informa un tamaño mayor que maxBytes no
  // se descarga.
  async downloadMedia(
    projectId: string,
    mediaId: string,
    maxBytes: number,
  ): Promise<DownloadedWhatsAppMedia | null> {
    const config = await this.configFor(projectId);
    const auth = { Authorization: `Bearer ${config.token}` };
    const info = (await this.graphRequest(
      `${config.baseUrl}/${encodeURIComponent(mediaId)}`,
      () => ({ method: 'GET', headers: auth }),
    )) as GraphMediaInfo;
    if (!info.url) {
      throw new BadGatewayException('WhatsApp did not return the media URL');
    }
    if (info.file_size !== undefined && info.file_size > maxBytes) {
      return null;
    }
    const content = (await this.graphRequest(
      info.url,
      () => ({ method: 'GET', headers: auth }),
      'binary',
    )) as Buffer;
    if (content.length > maxBytes) {
      return null;
    }
    return {
      content,
      mimeType: info.mime_type ?? 'application/octet-stream',
    };
  }

  private async postMessage(
    config: GraphConfig,
    message: Record<string, unknown>,
  ): Promise<SendWhatsAppMessageResult> {
    const body = JSON.stringify(message);
    const payload = (await this.graphRequest(
      `${config.baseUrl}/${config.phoneNumberId}/messages`,
      () => ({
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body,
      }),
    )) as GraphMessageResponse;

    const whatsappMessageId = payload.messages?.[0]?.id;
    if (!whatsappMessageId) {
      throw new ConflictException(
        'WhatsApp Cloud API accepted the message but returned no id',
      );
    }
    return { whatsappMessageId, status: 'SENT' };
  }

  private async configFor(projectId: string): Promise<GraphConfig> {
    const resolver =
      this.credentials ?? new WhatsAppCredentialsResolver(this.configService);
    const { token, phoneNumberId, businessAccountId } =
      await resolver.resolve(projectId);
    const version =
      this.configService.get<string>('WHATSAPP_GRAPH_API_VERSION') ?? 'v21.0';
    const base =
      this.configService.get<string>('WHATSAPP_GRAPH_BASE_URL') ??
      'https://graph.facebook.com';
    return {
      token,
      phoneNumberId,
      businessAccountId,
      baseUrl: `${base.replace(/\/$/, '')}/${version}`,
    };
  }

  private requireWabaId(config: GraphConfig): string {
    if (!config.businessAccountId) {
      throw new ServiceUnavailableException(
        'WhatsApp business account id (WABA) is not configured',
      );
    }
    return config.businessAccountId;
  }

  private destination(phone: string | null): string {
    if (!phone) {
      throw new ConflictException(
        'Lead has no phone number, WhatsApp message not sent',
      );
    }
    const to = normalizeWhatsAppPhone(phone);
    if (!to) {
      throw new ConflictException(
        'Lead phone number is not a valid WhatsApp destination',
      );
    }
    return to;
  }

  // Llamada a Graph con reintentos: 429/5xx y errores de red se reintentan con
  // espera exponencial; un 4xx es un error del pedido (409 con el mensaje de
  // Meta) y no se reintenta.
  private async graphRequest(
    url: string,
    buildInit: () => RequestInit,
    responseType: 'json' | 'binary' = 'json',
  ): Promise<unknown> {
    const maxRetries = Number(
      this.configService.get<string>('WHATSAPP_MAX_RETRIES') ?? 3,
    );
    const retryBaseMs = Number(
      this.configService.get<string>('WHATSAPP_RETRY_BASE_MS') ?? 250,
    );
    const timeoutMs = Number(
      this.configService.get<string>('WHATSAPP_REQUEST_TIMEOUT_MS') ?? 10_000,
    );
    const attempts = Math.max(maxRetries, 0) + 1;
    let lastError: unknown;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const response = await this.fetchImpl(url, {
          ...buildInit(),
          signal: AbortSignal.timeout(timeoutMs),
        });

        if (response.ok && responseType === 'binary') {
          return Buffer.from(await response.arrayBuffer());
        }

        const payload = (await this.parseJson(response)) as {
          error?: GraphError;
        };

        if (response.ok) {
          return payload;
        }

        const graphMessage =
          payload.error?.message ?? 'WhatsApp Cloud API request failed';

        if (isRetryableHttpStatus(response.status) && attempt < attempts - 1) {
          this.logger.warn(
            `WhatsApp request retry ${attempt + 1}/${attempts} after HTTP ${response.status}`,
          );
          await sleep(retryDelayMs(attempt, retryBaseMs));
          continue;
        }

        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 429
        ) {
          throw new ConflictException(graphMessage);
        }

        throw new BadGatewayException(graphMessage);
      } catch (error) {
        lastError = error;

        if (
          error instanceof ConflictException ||
          error instanceof ForbiddenException ||
          error instanceof ServiceUnavailableException ||
          error instanceof BadGatewayException
        ) {
          if (error instanceof BadGatewayException && attempt < attempts - 1) {
            this.logger.warn(
              `WhatsApp request retry ${attempt + 1}/${attempts} after gateway error`,
            );
            await sleep(retryDelayMs(attempt, retryBaseMs));
            continue;
          }
          throw error;
        }

        if (attempt < attempts - 1) {
          this.logger.warn(
            `WhatsApp request retry ${attempt + 1}/${attempts} after network error`,
          );
          await sleep(retryDelayMs(attempt, retryBaseMs));
          continue;
        }
      }
    }

    this.logger.error(
      'WhatsApp Cloud API request failed after retries',
      lastError,
    );
    throw new BadGatewayException('WhatsApp Cloud API request failed');
  }

  private async parseJson(response: Response): Promise<unknown> {
    try {
      return await response.json();
    } catch {
      return {};
    }
  }
}
