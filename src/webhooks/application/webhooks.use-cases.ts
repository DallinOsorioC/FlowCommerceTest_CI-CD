import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Permission } from '@flowcommerce/types';
import { AuthorizationService } from '../../authorization/application/services/authorization.service';
import { SecretCipher } from '../../common/crypto/secret-cipher';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../common/exceptions/domain.exceptions';
import { generateWebhookSecret } from '../domain/signing';
import { assertSafeWebhookUrl } from '../domain/url-guard';
import {
  ALL_EVENTS,
  MAX_ENDPOINTS_PER_PROJECT,
  PING_EVENT,
  WEBHOOKS_REPOSITORY,
  WEBHOOK_EVENTS,
  type WebhookDelivery,
  type WebhookEndpoint,
  type WebhooksRepository,
} from '../domain/webhook';
import { WebhookDispatcher, type DeliveryResult } from './webhook-dispatcher';

// Gestión de webhooks salientes: solo OWNER y ADMIN (PROJECT_UPDATE). El
// secreto de firma se devuelve UNA vez, al crear o rotar; después solo se ve
// su prefijo.
@Injectable()
export class WebhooksUseCases {
  constructor(
    private readonly authorizationService: AuthorizationService,
    private readonly configService: ConfigService,
    private readonly cipher: SecretCipher,
    private readonly dispatcher: WebhookDispatcher,
    @Inject(WEBHOOKS_REPOSITORY)
    private readonly repository: WebhooksRepository,
  ) {}

  async create(input: {
    actorUserId: string;
    projectId: string;
    url: string;
    description?: string | null;
    events: string[];
  }): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
    await this.assertCan(input.actorUserId, input.projectId);
    const events = this.normalizeEvents(input.events);
    await this.assertUrl(input.url);
    const existing = await this.repository.listByProject(input.projectId);
    if (existing.length >= MAX_ENDPOINTS_PER_PROJECT) {
      throw new ConflictException(
        `A project can have up to ${MAX_ENDPOINTS_PER_PROJECT} webhooks. Delete one first.`,
      );
    }
    const { secret, prefix } = generateWebhookSecret();
    const endpoint = await this.repository.create({
      projectId: input.projectId,
      url: input.url,
      description: input.description?.trim() || null,
      events,
      secretEncrypted: this.cipher.encrypt(secret),
      secretPrefix: prefix,
      createdByUserId: input.actorUserId,
    });
    this.dispatcher.invalidate(input.projectId);
    return { endpoint, secret };
  }

  async list(input: {
    actorUserId: string;
    projectId: string;
  }): Promise<WebhookEndpoint[]> {
    await this.assertCan(input.actorUserId, input.projectId);
    return this.repository.listByProject(input.projectId);
  }

  async update(input: {
    actorUserId: string;
    projectId: string;
    id: string;
    url?: string;
    description?: string | null;
    events?: string[];
    active?: boolean;
  }): Promise<WebhookEndpoint> {
    await this.assertCan(input.actorUserId, input.projectId);
    if (input.url !== undefined) {
      await this.assertUrl(input.url);
    }
    const updated = await this.repository.update(input.id, input.projectId, {
      ...(input.url !== undefined && { url: input.url }),
      ...(input.description !== undefined && {
        description: input.description?.trim() || null,
      }),
      ...(input.events !== undefined && {
        events: this.normalizeEvents(input.events),
      }),
      ...(input.active !== undefined && { active: input.active }),
    });
    this.dispatcher.invalidate(input.projectId);
    return this.found(updated);
  }

  async rotateSecret(input: {
    actorUserId: string;
    projectId: string;
    id: string;
  }): Promise<{ endpoint: WebhookEndpoint; secret: string }> {
    await this.assertCan(input.actorUserId, input.projectId);
    const { secret, prefix } = generateWebhookSecret();
    const endpoint = this.found(
      await this.repository.update(input.id, input.projectId, {
        secretEncrypted: this.cipher.encrypt(secret),
        secretPrefix: prefix,
      }),
    );
    this.dispatcher.invalidate(input.projectId);
    return { endpoint, secret };
  }

  async remove(input: {
    actorUserId: string;
    projectId: string;
    id: string;
  }): Promise<void> {
    await this.assertCan(input.actorUserId, input.projectId);
    if (!(await this.repository.deleteInProject(input.id, input.projectId))) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    this.dispatcher.invalidate(input.projectId);
  }

  // Envía un evento `ping` real (firmado) y devuelve el resultado.
  async test(input: {
    actorUserId: string;
    projectId: string;
    id: string;
  }): Promise<DeliveryResult> {
    await this.assertCan(input.actorUserId, input.projectId);
    const endpoint = await this.repository.findInProject(
      input.id,
      input.projectId,
    );
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    // Un solo intento y corto: el ciclo completo de reintentos puede tardar
    // más de lo que aguanta una petición HTTP detrás de un proxy.
    return this.dispatcher.deliver(
      endpoint,
      PING_EVENT,
      { message: 'Webhook de prueba de Flowcommerce' },
      { maxAttempts: 1, timeoutMs: 8000 },
    );
  }

  async deliveries(input: {
    actorUserId: string;
    projectId: string;
    id: string;
  }): Promise<WebhookDelivery[]> {
    await this.assertCan(input.actorUserId, input.projectId);
    const endpoint = await this.repository.findInProject(
      input.id,
      input.projectId,
    );
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    return this.repository.listDeliveries(input.id, input.projectId, 50);
  }

  private found(endpoint: WebhookEndpoint | null): WebhookEndpoint {
    if (!endpoint) {
      throw new NotFoundException('Webhook endpoint not found');
    }
    return endpoint;
  }

  private normalizeEvents(events: string[]): string[] {
    const unique = [...new Set(events)];
    if (unique.length === 0) {
      throw new BadRequestException('Subscribe to at least one event');
    }
    const unknown = unique.filter(
      (event) => event !== ALL_EVENTS && !WEBHOOK_EVENTS.includes(event),
    );
    if (unknown.length > 0) {
      throw new BadRequestException(`Unknown events: ${unknown.join(', ')}`);
    }
    return unique.includes(ALL_EVENTS) ? [ALL_EVENTS] : unique;
  }

  private assertUrl(url: string) {
    return assertSafeWebhookUrl(url, {
      allowPrivateTargets:
        this.configService.get<string>('WEBHOOKS_ALLOW_PRIVATE_TARGETS') ===
          'true' && this.configService.get<string>('NODE_ENV') !== 'production',
    });
  }

  private assertCan(actorUserId: string, projectId: string) {
    return this.authorizationService.assertCan(
      actorUserId,
      Permission.PROJECT_UPDATE,
      projectId,
    );
  }
}
