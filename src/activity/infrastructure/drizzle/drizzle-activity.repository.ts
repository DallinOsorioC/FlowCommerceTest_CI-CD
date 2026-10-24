import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, or, type SQL } from 'drizzle-orm';
import type { ActivityType } from '@flowcommerce/types';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { activityEvents, leads, users } from '../../../db/schema';
import type {
  ActivityRepository,
  ActivityView,
  ListActivityFilter,
  RecordActivityInput,
} from '../../domain/activity';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

@Injectable()
export class DrizzleActivityRepository implements ActivityRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async insert(input: RecordActivityInput): Promise<void> {
    await this.db.insert(activityEvents).values({
      projectId: input.projectId,
      actorUserId: input.actorUserId ?? null,
      type: input.type,
      title: input.title,
      leadId: input.leadId ?? null,
      clientId: input.clientId ?? null,
      quoteId: input.quoteId ?? null,
      metadata: input.metadata ?? {},
    });
  }

  // Más recientes primero. El nombre de quien lo hizo sale de un LEFT JOIN
  // (una sola consulta, sin N+1); si el usuario se borró, actor = null.
  async list(
    projectId: string,
    filter: ListActivityFilter,
  ): Promise<{ events: ActivityView[]; total: number }> {
    const conditions: SQL[] = [eq(activityEvents.projectId, projectId)];
    if (filter.leadId) {
      conditions.push(eq(activityEvents.leadId, filter.leadId));
    }
    if (filter.clientId) {
      // Eventos del cliente y de los leads que le pertenecen (el lead de
      // origen y los que se le asociaron después), siempre dentro del tenant.
      const byClient = or(
        eq(activityEvents.clientId, filter.clientId),
        inArray(
          activityEvents.leadId,
          this.db
            .select({ id: leads.id })
            .from(leads)
            .where(
              and(
                eq(leads.projectId, projectId),
                eq(leads.clientId, filter.clientId),
              ),
            ),
        ),
      );
      if (byClient) {
        conditions.push(byClient);
      }
    }
    if (filter.quoteId) {
      conditions.push(eq(activityEvents.quoteId, filter.quoteId));
    }
    if (filter.types && filter.types.length > 0) {
      conditions.push(inArray(activityEvents.type, filter.types));
    }
    const where = and(...conditions);
    const limit = Math.min(
      Math.max(filter.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const page = Math.max(filter.page ?? 1, 1);

    const [rows, [totalRow]] = await Promise.all([
      this.db
        .select({
          event: activityEvents,
          actorName: users.name,
        })
        .from(activityEvents)
        .leftJoin(users, eq(users.id, activityEvents.actorUserId))
        .where(where)
        .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ value: count() }).from(activityEvents).where(where),
    ]);

    return {
      events: rows.map(({ event, actorName }) => ({
        id: event.id,
        projectId: event.projectId,
        type: event.type as ActivityType,
        title: event.title,
        actor:
          event.actorUserId && actorName
            ? { id: event.actorUserId, name: actorName }
            : null,
        leadId: event.leadId,
        clientId: event.clientId,
        quoteId: event.quoteId,
        metadata: event.metadata,
        creadoEn: event.createdAt,
      })),
      total: totalRow?.value ?? 0,
    };
  }
}
