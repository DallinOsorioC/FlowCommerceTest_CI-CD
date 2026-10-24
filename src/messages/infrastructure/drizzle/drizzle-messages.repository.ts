import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import type { MessageType } from '@flowcommerce/types';
import { leads, messages, type MessageRow } from '../../../db/schema';
import { MessageEntity } from '../../domain/entities/message.entity';
import type {
  ConversationSummary,
  CreateMessageInput,
  LeadMessagesPage,
  ListConversationsFilter,
  MessagesRepository,
  PaginatedConversations,
  UnreadCounts,
} from '../../domain/ports/messages.repository';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

// Mensajes del cliente que nadie ha abierto en el CRM.
const isUnreadInbound = sql`${messages.direction} = 'INBOUND' and ${messages.readAt} is null`;

// Fecha como milisegundos epoch (bigint → string en el driver). Se usa en los
// agregados (max) porque ahí Drizzle no sabe que el valor es una fecha.
const epochMs = (expression: SQL) =>
  sql<string | null>`(extract(epoch from ${expression}) * 1000)::bigint`;

const fromEpochMs = (value: string | null): Date | null =>
  value === null ? null : new Date(Number(value));

@Injectable()
export class DrizzleMessagesRepository implements MessagesRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  // El projectId viene del contexto autorizado (nunca del body del cliente)
  // y se escribe junto al mensaje: la fila nace dentro del tenant.
  async create(input: CreateMessageInput): Promise<MessageEntity> {
    const [row] = await this.db
      .insert(messages)
      .values({
        projectId: input.projectId,
        leadId: input.leadId,
        whatsappMessageId: input.whatsappMessageId,
        direction: input.direction,
        content: input.content,
        status: input.status,
        type: input.type ?? 'TEXT',
        templateName: input.templateName ?? null,
        attachmentId: input.attachmentId ?? null,
      })
      .returning();

    return this.mapToEntity(row);
  }

  async createIfNotExists(
    input: CreateMessageInput,
  ): Promise<MessageEntity | null> {
    const [row] = await this.db
      .insert(messages)
      .values({
        projectId: input.projectId,
        leadId: input.leadId,
        whatsappMessageId: input.whatsappMessageId,
        direction: input.direction,
        content: input.content,
        status: input.status,
        type: input.type ?? 'TEXT',
        templateName: input.templateName ?? null,
        attachmentId: input.attachmentId ?? null,
      })
      .onConflictDoNothing({ target: messages.whatsappMessageId })
      .returning();

    if (row) {
      return this.mapToEntity(row);
    }

    // Conflicto de wamid: solo se reutiliza si ya pertenece a ESTE proyecto.
    return this.findByWhatsappMessageIdInProject(
      input.whatsappMessageId,
      input.projectId,
    );
  }

  async setAttachmentIfEmptyInProject(
    messageId: string,
    projectId: string,
    attachmentId: string,
  ): Promise<boolean> {
    const updated = await this.db
      .update(messages)
      .set({ attachmentId })
      .where(
        and(
          eq(messages.id, messageId),
          eq(messages.projectId, projectId),
          isNull(messages.attachmentId),
        ),
      )
      .returning({ id: messages.id });
    return updated.length > 0;
  }

  async findByWhatsappMessageIdInProject(
    whatsappMessageId: string,
    projectId: string,
  ): Promise<MessageEntity | null> {
    const row = await this.db.query.messages.findFirst({
      where: and(
        eq(messages.whatsappMessageId, whatsappMessageId),
        eq(messages.projectId, projectId),
      ),
    });

    return row ? this.mapToEntity(row) : null;
  }

  async updateStatusInProject(
    whatsappMessageId: string,
    projectId: string,
    status: string,
    errorMessage: string | null = null,
  ): Promise<MessageEntity | null> {
    const [row] = await this.db
      .update(messages)
      .set({
        status,
        errorMessage: status === 'FAILED' ? errorMessage : null,
      })
      .where(
        and(
          eq(messages.whatsappMessageId, whatsappMessageId),
          eq(messages.projectId, projectId),
        ),
      )
      .returning();

    return row ? this.mapToEntity(row) : null;
  }

  // Paginación por CURSOR (no por página): en un chat llegan mensajes nuevos
  // mientras el usuario hace scroll hacia arriba, y con OFFSET se repetirían o
  // saltarían mensajes. El cursor es el id del mensaje más antiguo que ya se
  // mostró; se piden los anteriores comparando (creado_en, id) como tupla para
  // desempatar dos mensajes del mismo instante.
  //
  // Se lee de más reciente a más antiguo (usa el índice project_id, lead_id,
  // creado_en) y se invierte al final para devolverlo en orden de lectura.
  async listByLeadInProject(
    leadId: string,
    projectId: string,
    options: { before?: string; limit: number },
  ): Promise<LeadMessagesPage> {
    const limit = Math.min(Math.max(options.limit, 1), MAX_LIMIT);
    const conditions: SQL[] = [
      eq(messages.projectId, projectId),
      eq(messages.leadId, leadId),
    ];

    if (options.before) {
      // La subconsulta también filtra por tenant y lead: un cursor de otro
      // chat no devuelve fila, la comparación da NULL y la página sale vacía.
      conditions.push(
        sql`(${messages.createdAt}, ${messages.id}) < (
          select c.creado_en, c.id from messages c
          where c.id = ${options.before}
            and c.project_id = ${projectId}
            and c.lead_id = ${leadId}
        )`,
      );
    }

    const rows = await this.db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      // Se pide uno de más solo para saber si quedan mensajes anteriores.
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse();

    return { messages: page.map((row) => this.mapToEntity(row)), hasMore };
  }

  async findLastInboundAtInProject(
    leadId: string,
    projectId: string,
  ): Promise<Date | null> {
    const [row] = await this.db
      .select({ lastInboundAt: epochMs(sql`max(${messages.createdAt})`) })
      .from(messages)
      .where(
        and(
          eq(messages.projectId, projectId),
          eq(messages.leadId, leadId),
          eq(messages.direction, 'INBOUND'),
        ),
      );

    return fromEpochMs(row?.lastInboundAt ?? null);
  }

  async markInboundAsReadInProject(
    leadId: string,
    projectId: string,
    readAt: Date,
  ): Promise<number> {
    const updated = await this.db
      .update(messages)
      .set({ readAt })
      .where(
        and(
          eq(messages.projectId, projectId),
          eq(messages.leadId, leadId),
          eq(messages.direction, 'INBOUND'),
          isNull(messages.readAt),
        ),
      )
      .returning({ id: messages.id });

    return updated.length;
  }

  // Bandeja de conversaciones en 3 consultas fijas (sin N+1):
  //   1. stats: un GROUP BY lead_id sobre messages del tenant con la fecha del
  //      último mensaje, los no leídos y el último INBOUND; se une a leads
  //      (también por project_id), se filtra, se ordena y se pagina.
  //   2. el total para la paginación, con los mismos filtros.
  //   3. el último mensaje de cada lead de la página (DISTINCT ON).
  async listConversationsInProject(
    projectId: string,
    filter: ListConversationsFilter = {},
  ): Promise<PaginatedConversations> {
    const limit = Math.min(filter.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const page = Math.max(filter.page ?? 1, 1);

    const stats = this.db
      .select({
        leadId: messages.leadId,
        lastAt: sql<Date>`max(${messages.createdAt})`.as('last_at'),
        unread: sql<number>`count(*) filter (where ${isUnreadInbound})`
          .mapWith(Number)
          .as('unread'),
        lastInboundAt: epochMs(
          sql`max(${messages.createdAt}) filter (where ${messages.direction} = 'INBOUND')`,
        ).as('last_inbound_at'),
      })
      .from(messages)
      .where(eq(messages.projectId, projectId))
      .groupBy(messages.leadId)
      .as('stats');

    const conditions: SQL[] = [eq(leads.projectId, projectId)];
    if (filter.search) {
      const pattern = `%${this.escapeLikePattern(filter.search)}%`;
      const bySearch = or(
        ilike(leads.name, pattern),
        ilike(leads.phone, pattern),
        ilike(leads.company, pattern),
      );
      if (bySearch) {
        conditions.push(bySearch);
      }
    }
    if (filter.unread) {
      conditions.push(gt(stats.unread, 0));
    }
    const join = and(eq(leads.id, stats.leadId), ...conditions);

    const [rows, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: leads.id,
          name: leads.name,
          phone: leads.phone,
          company: leads.company,
          stage: leads.stage,
          unread: stats.unread,
          lastInboundAt: stats.lastInboundAt,
        })
        .from(stats)
        .innerJoin(leads, join)
        .orderBy(desc(stats.lastAt), asc(leads.id))
        .limit(limit)
        .offset((page - 1) * limit),
      this.db.select({ total: count() }).from(stats).innerJoin(leads, join),
    ]);

    if (rows.length === 0) {
      return { conversations: [], total };
    }

    const lastMessages = await this.db
      .selectDistinctOn([messages.leadId])
      .from(messages)
      .where(
        and(
          eq(messages.projectId, projectId),
          inArray(
            messages.leadId,
            rows.map((row) => row.id),
          ),
        ),
      )
      .orderBy(messages.leadId, desc(messages.createdAt), desc(messages.id));
    const lastByLead = new Map(
      lastMessages.map((row) => [row.leadId, this.mapToEntity(row)]),
    );

    const conversations: ConversationSummary[] = [];
    for (const row of rows) {
      const lastMessage = lastByLead.get(row.id);
      if (!lastMessage) {
        continue;
      }
      conversations.push({
        lead: {
          id: row.id,
          name: row.name,
          phone: row.phone,
          company: row.company,
          stage: row.stage,
        },
        lastMessage,
        unreadCount: Number(row.unread),
        lastInboundAt: fromEpochMs(row.lastInboundAt),
      });
    }

    return { conversations, total };
  }

  async countUnreadInProject(projectId: string): Promise<UnreadCounts> {
    const [row] = await this.db
      .select({
        messages: count(),
        conversations: sql<number>`count(distinct ${messages.leadId})`.mapWith(
          Number,
        ),
      })
      .from(messages)
      .where(and(eq(messages.projectId, projectId), isUnreadInbound));

    return {
      conversations: row?.conversations ?? 0,
      messages: row?.messages ?? 0,
    };
  }

  // Escapa los comodines de LIKE para que la búsqueda sea literal.
  private escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
  }

  private mapToEntity(row: MessageRow): MessageEntity {
    return new MessageEntity(
      row.id,
      row.projectId,
      row.leadId,
      row.whatsappMessageId,
      row.direction,
      row.content,
      row.status,
      row.createdAt,
      row.errorMessage,
      row.readAt,
      row.type as MessageType,
      row.templateName,
      row.attachmentId,
    );
  }
}
