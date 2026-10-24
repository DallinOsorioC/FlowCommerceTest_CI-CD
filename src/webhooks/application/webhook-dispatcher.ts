import { randomUUID } from 'node:crypto';
import {
  HttpException,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecretCipher } from '../../common/crypto/secret-cipher';
import { SIGNATURE_HEADER, signWebhook } from '../domain/signing';
import { resolveSafeWebhookTarget } from '../domain/url-guard';
import { pinnedHttp } from '../infrastructure/pinned-http';
import {
  WEBHOOKS_REPOSITORY,
  type WebhookEndpointWithSecret,
  type WebhooksRepository,
} from '../domain/webhook';

export const WEBHOOK_FETCH = Symbol('WEBHOOK_FETCH');

// Petición saliente. address es la IP ya validada por el guard anti-SSRF: el
// transporte conecta a ella sin volver a resolver el nombre.
export interface WebhookRequest {
  method: 'POST';
  redirect: 'manual';
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
  address: { address: string; family: 4 | 6 } | null;
}

export type WebhookHttp = (
  url: URL,
  init: WebhookRequest,
) => Promise<{ status: number }>;

export interface DeliverOptions {
  // Para el botón «Probar»: un intento corto en vez del ciclo completo.
  maxAttempts?: number;
  timeoutMs?: number;
}

// Cuánto se recuerdan los endpoints de un proyecto antes de volver a la BD.
const ENDPOINTS_CACHE_TTL_MS = 30_000;

export interface DeliveryResult {
  status: 'SUCCESS' | 'FAILED';
  attempts: number;
  responseStatus: number | null;
  error: string | null;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

// Envía los eventos del proyecto a sus webhooks. publish() NO bloquea ni
// lanza: un endpoint caído no debe frenar la operación que originó el evento
// (crear un lead, recibir un mensaje…). Cada envío reintenta con espera
// exponencial y deja un registro en webhook_deliveries.
//
// Limitación conocida: los reintentos viven en el proceso. Si el servidor se
// reinicia a mitad de uno, ese envío se pierde (queda sin registro). Para
// garantía «al menos una vez» haría falta una cola persistente.
@Injectable()
export class WebhookDispatcher {
  private readonly logger = new Logger(WebhookDispatcher.name);
  private readonly http: WebhookHttp;
  private readonly endpointsCache = new Map<
    string,
    { at: number; endpoints: WebhookEndpointWithSecret[] }
  >();
  private active = 0;
  private readonly waiting: Array<() => void> = [];

  constructor(
    private readonly configService: ConfigService,
    private readonly cipher: SecretCipher,
    @Inject(WEBHOOKS_REPOSITORY)
    private readonly repository: WebhooksRepository,
    @Optional()
    @Inject(WEBHOOK_FETCH)
    http?: WebhookHttp,
  ) {
    this.http = http ?? pinnedHttp;
  }

  // Hay que llamarlo al crear, editar, rotar o borrar un webhook: olvida los
  // endpoints en memoria de ese proyecto (otras instancias lo notan al vencer
  // el TTL).
  invalidate(projectId: string): void {
    for (const key of this.endpointsCache.keys()) {
      if (key.startsWith(`${projectId}:`)) {
        this.endpointsCache.delete(key);
      }
    }
  }

  // Dispara el evento a los endpoints suscritos y vuelve de inmediato.
  publish(projectId: string, event: string, data: Record<string, unknown>) {
    if (this.configService.get<string>('WEBHOOKS_ENABLED') === 'false') {
      return;
    }
    void this.fanOut(projectId, event, data).catch((error: unknown) =>
      this.logger.error(
        `Webhook fan-out for ${event} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }

  // Awaitable: lo usa el botón «Probar» y los tests.
  async fanOut(
    projectId: string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const endpoints = await this.subscribed(projectId, event);
    await Promise.all(
      endpoints.map((endpoint) => this.deliver(endpoint, event, data)),
    );
  }

  // Cada evento de actividad pasa por aquí: sin la caché, un proyecto sin
  // webhooks igual pagaría una consulta por evento.
  private async subscribed(
    projectId: string,
    event: string,
  ): Promise<WebhookEndpointWithSecret[]> {
    const key = `${projectId}:${event}`;
    const hit = this.endpointsCache.get(key);
    if (hit && Date.now() - hit.at < ENDPOINTS_CACHE_TTL_MS) {
      return hit.endpoints;
    }
    const endpoints = await this.repository.listSubscribed(projectId, event);
    this.endpointsCache.set(key, { at: Date.now(), endpoints });
    return endpoints;
  }

  // Tope de envíos simultáneos en el proceso: un receptor lento no puede
  // acumular sockets y temporizadores sin límite. El cupo se cede directo al
  // siguiente en espera.
  private async withSlot<T>(task: () => Promise<T>): Promise<T> {
    const limit = Math.max(
      Number(this.configService.get<string>('WEBHOOKS_MAX_CONCURRENCY') ?? 20),
      1,
    );
    if (this.active >= limit) {
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active += 1;
    }
    try {
      return await task();
    } finally {
      const next = this.waiting.shift();
      if (next) {
        next();
      } else {
        this.active -= 1;
      }
    }
  }

  async deliver(
    endpoint: WebhookEndpointWithSecret,
    event: string,
    data: Record<string, unknown>,
    options: DeliverOptions = {},
  ): Promise<DeliveryResult> {
    const body = JSON.stringify({
      id: randomUUID(),
      event,
      createdAt: new Date().toISOString(),
      projectId: endpoint.projectId,
      data,
    });
    const started = Date.now();
    const result = await this.sendWithRetries(endpoint, event, body, options);
    try {
      await this.repository.recordDelivery({
        endpointId: endpoint.id,
        projectId: endpoint.projectId,
        event,
        ...result,
        durationMs: Date.now() - started,
      });
    } catch (error) {
      this.logger.error(
        `Could not record webhook delivery: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return result;
  }

  private async sendWithRetries(
    endpoint: WebhookEndpointWithSecret,
    event: string,
    body: string,
    options: DeliverOptions,
  ): Promise<DeliveryResult> {
    const maxAttempts =
      options.maxAttempts ??
      Math.max(
        Number(this.configService.get<string>('WEBHOOKS_MAX_ATTEMPTS') ?? 3),
        1,
      );
    const baseMs = Number(
      this.configService.get<string>('WEBHOOKS_RETRY_BASE_MS') ?? 1000,
    );
    let last: Omit<DeliveryResult, 'attempts'> = {
      status: 'FAILED',
      responseStatus: null,
      error: 'not attempted',
    };

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const outcome = await this.withSlot(() =>
        this.attempt(endpoint, event, body, options),
      );
      last = outcome.result;
      if (last.status === 'SUCCESS' || !outcome.retryable) {
        return { ...last, attempts: attempt };
      }
      if (attempt < maxAttempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, baseMs * 4 ** (attempt - 1)),
        );
      }
    }
    return { ...last, attempts: maxAttempts };
  }

  private async attempt(
    endpoint: WebhookEndpointWithSecret,
    event: string,
    body: string,
    options: DeliverOptions,
  ): Promise<{
    result: Omit<DeliveryResult, 'attempts'>;
    retryable: boolean;
  }> {
    try {
      // La URL se revalida en cada envío: el DNS pudo cambiar a una IP
      // interna después de registrar el endpoint.
      // Se conecta a la IP validada aquí mismo, sin volver a resolver el
      // nombre (si no, un DNS que cambia entre ambos pasos burla el guard).
      const { url, address } = await resolveSafeWebhookTarget(endpoint.url, {
        allowPrivateTargets: this.allowPrivateTargets(),
      });
      const secret = this.cipher.decrypt(endpoint.secretEncrypted);
      const timestamp = Math.floor(Date.now() / 1000);
      const response = await this.http(url, {
        method: 'POST',
        // Una redirección podría llevar la petición a un host interno.
        redirect: 'manual',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Flowcommerce-Webhooks/1',
          'X-Flowcommerce-Event': event,
          [SIGNATURE_HEADER]: signWebhook(secret, timestamp, body),
        },
        body,
        address,
        signal: AbortSignal.timeout(
          options.timeoutMs ??
            Number(
              this.configService.get<string>('WEBHOOKS_TIMEOUT_MS') ?? 10_000,
            ),
        ),
      });
      if (response.status >= 200 && response.status < 300) {
        return {
          result: {
            status: 'SUCCESS',
            responseStatus: response.status,
            error: null,
          },
          retryable: false,
        };
      }
      return {
        result: {
          status: 'FAILED',
          responseStatus: response.status,
          error: `HTTP ${response.status}`,
        },
        retryable: RETRYABLE_STATUS.has(response.status),
      };
    } catch (error) {
      const known = error instanceof HttpException;
      return {
        result: {
          status: 'FAILED',
          responseStatus: null,
          error: (error instanceof Error
            ? error.message
            : 'request failed'
          ).slice(0, 500),
        },
        // Una URL rechazada o un secreto ilegible no se arreglan reintentando.
        retryable: !known,
      };
    }
  }

  private allowPrivateTargets(): boolean {
    return (
      this.configService.get<string>('WEBHOOKS_ALLOW_PRIVATE_TARGETS') ===
        'true' && this.configService.get<string>('NODE_ENV') !== 'production'
    );
  }
}
