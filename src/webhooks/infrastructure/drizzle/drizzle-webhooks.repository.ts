import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import {
  webhookDeliveries,
  webhookEndpoints,
  type WebhookDeliveryRow,
  type WebhookEndpointRow,
} from '../../../db/schema';
import {
  ALL_EVENTS,
  DELIVERY_LOG_LIMIT,
  type WebhookDelivery,
  type WebhookEndpoint,
  type WebhookEndpointWithSecret,
  type WebhooksRepository,
} from '../../domain/webhook';

@Injectable()
export class DrizzleWebhooksRepository implements WebhooksRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async create(
    input: Parameters<WebhooksRepository['create']>[0],
  ): Promise<WebhookEndpoint> {
    const [row] = await this.db
      .insert(webhookEndpoints)
      .values(input)
      .returning();
    return this.mapEndpoint(row);
  }

  async listByProject(projectId: string): Promise<WebhookEndpoint[]> {
    const rows = await this.db
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.projectId, projectId))
      .orderBy(desc(webhookEndpoints.createdAt));
    return rows.map((row) => this.mapEndpoint(row));
  }

  async findInProject(
    id: string,
    projectId: string,
  ): Promise<WebhookEndpointWithSecret | null> {
    const [row] = await this.db
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.id, id),
          eq(webhookEndpoints.projectId, projectId),
        ),
      )
      .limit(1);
    return row ? this.mapWithSecret(row) : null;
  }

  async update(
    id: string,
    projectId: string,
    patch: Parameters<WebhooksRepository['update']>[2],
  ): Promise<WebhookEndpoint | null> {
    const [row] = await this.db
      .update(webhookEndpoints)
      .set(patch)
      .where(
        and(
          eq(webhookEndpoints.id, id),
          eq(webhookEndpoints.projectId, projectId),
        ),
      )
      .returning();
    return row ? this.mapEndpoint(row) : null;
  }

  async deleteInProject(id: string, projectId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.id, id),
          eq(webhookEndpoints.projectId, projectId),
        ),
      )
      .returning({ id: webhookEndpoints.id });
    return deleted.length > 0;
  }

  async listSubscribed(
    projectId: string,
    event: string,
  ): Promise<WebhookEndpointWithSecret[]> {
    const rows = await this.db
      .select()
      .from(webhookEndpoints)
      .where(
        and(
          eq(webhookEndpoints.projectId, projectId),
          eq(webhookEndpoints.active, true),
          sql`(${event} = ANY(${webhookEndpoints.events}) OR ${ALL_EVENTS} = ANY(${webhookEndpoints.events}))`,
        ),
      );
    return rows.map((row) => this.mapWithSecret(row));
  }

  async recordDelivery(
    input: Parameters<WebhooksRepository['recordDelivery']>[0],
  ): Promise<void> {
    await this.db.insert(webhookDeliveries).values(input);
    // El historial no crece sin límite: se conservan los últimos envíos de
    // este endpoint.
    await this.db
      .delete(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.endpointId, input.endpointId),
          notInArray(
            webhookDeliveries.id,
            this.db
              .select({ id: webhookDeliveries.id })
              .from(webhookDeliveries)
              .where(eq(webhookDeliveries.endpointId, input.endpointId))
              .orderBy(desc(webhookDeliveries.createdAt))
              .limit(DELIVERY_LOG_LIMIT),
          ),
        ),
      );
  }

  async listDeliveries(
    endpointId: string,
    projectId: string,
    limit: number,
  ): Promise<WebhookDelivery[]> {
    const rows = await this.db
      .select()
      .from(webhookDeliveries)
      .where(
        and(
          eq(webhookDeliveries.endpointId, endpointId),
          eq(webhookDeliveries.projectId, projectId),
        ),
      )
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(limit);
    return rows.map((row) => this.mapDelivery(row));
  }

  private mapEndpoint(row: WebhookEndpointRow): WebhookEndpoint {
    return {
      id: row.id,
      projectId: row.projectId,
      url: row.url,
      description: row.description,
      events: row.events,
      secretPrefix: row.secretPrefix,
      active: row.active,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapWithSecret(row: WebhookEndpointRow): WebhookEndpointWithSecret {
    return { ...this.mapEndpoint(row), secretEncrypted: row.secretEncrypted };
  }

  private mapDelivery(row: WebhookDeliveryRow): WebhookDelivery {
    return {
      id: row.id,
      endpointId: row.endpointId,
      event: row.event,
      status: row.status as WebhookDelivery['status'],
      attempts: row.attempts,
      responseStatus: row.responseStatus,
      error: row.error,
      durationMs: row.durationMs,
      createdAt: row.createdAt,
    };
  }
}
