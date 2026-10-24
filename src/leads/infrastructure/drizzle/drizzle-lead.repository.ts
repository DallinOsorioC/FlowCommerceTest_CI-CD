import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  notExists,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import {
  clients,
  followUps,
  leads,
  messages,
  quotes,
  type LeadRow,
} from '../../../db/schema';
import { isForeignKeyViolation } from '../../../common/utils/postgres-error';
import { LeadEntity, type RefSummary } from '../../domain/entities/lead.entity';
import type {
  CreateLeadInput,
  DeleteLeadResult,
  LeadRepository,
  ListLeadsFilter,
  PaginatedLeads,
  UpdateLeadInput,
} from '../../domain/repositories/lead.repository';
import type { LeadStage, RecordOrigin } from '@flowcommerce/types';

// Límite duro por página. El DTO de presentación ya valida @Max(100), pero el
// repositorio se defiende por si algún llamante interno lo invoca sin DTO.
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

// Resúmenes {id, name} que acompañan al lead en las lecturas.
const WITH_REFS = {
  assignedUser: { columns: { id: true, name: true } },
  client: { columns: { id: true, name: true } },
  interestProduct: { columns: { id: true, name: true } },
} as const;

type LeadRowWithRefs = LeadRow & {
  assignedUser?: RefSummary | null;
  client?: RefSummary | null;
  interestProduct?: RefSummary | null;
};

@Injectable()
export class DrizzleLeadRepository implements LeadRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  // Busca un lead filtrando SIEMPRE por proyecto (impide IDOR entre tenants).
  async findByIdInProject(
    id: string,
    projectId: string,
  ): Promise<LeadEntity | null> {
    const row = await this.db.query.leads.findFirst({
      where: and(eq(leads.id, id), eq(leads.projectId, projectId)),
      with: WITH_REFS,
    });
    if (!row) {
      return null;
    }
    const next = await this.nextFollowUps([row.id], projectId);
    return this.mapToEntity(row, next.get(row.id));
  }

  // "Próximo seguimiento" de cada lead: el PENDING con la fecha más cercana.
  // Una sola consulta agregada por página (sin N+1).
  private async nextFollowUps(
    leadIds: string[],
    projectId: string,
  ): Promise<Map<string, Date>> {
    if (leadIds.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({
        leadId: followUps.leadId,
        // Epoch en ms: el driver devolvería el timestamp como texto.
        nextAt: sql<string>`(extract(epoch from min(${followUps.dueAt})) * 1000)::bigint`,
      })
      .from(followUps)
      .where(
        and(
          eq(followUps.projectId, projectId),
          eq(followUps.status, 'PENDING'),
          inArray(followUps.leadId, leadIds),
        ),
      )
      .groupBy(followUps.leadId);
    return new Map(
      rows.map((row) => [row.leadId, new Date(Number(row.nextAt))]),
    );
  }

  async findByPhoneDigitsInProject(
    phoneDigits: string,
    projectId: string,
  ): Promise<LeadEntity | null> {
    if (!phoneDigits) {
      return null;
    }

    const row = await this.db.query.leads.findFirst({
      where: and(
        eq(leads.projectId, projectId),
        sql`regexp_replace(coalesce(${leads.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits}`,
      ),
    });

    return row ? this.mapToEntity(row) : null;
  }

  // El candado consultivo (pg_advisory_xact_lock) serializa SOLO las
  // transacciones que buscan el mismo número en el mismo proyecto y se libera
  // al terminar la transacción. Así "buscar y, si no está, crear" es atómico
  // sin necesitar un índice único sobre el teléfono (que hoy admite duplicados
  // creados a mano).
  async findOrCreateByPhoneInProject(
    phoneDigits: string,
    projectId: string,
    input: CreateLeadInput,
  ): Promise<{ lead: LeadEntity; created: boolean }> {
    const { id, created } = await this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`lead-phone:${projectId}:${phoneDigits}`}))`,
      );

      const existing = await tx.query.leads.findFirst({
        columns: { id: true },
        where: and(
          eq(leads.projectId, projectId),
          sql`regexp_replace(coalesce(${leads.phone}, ''), '[^0-9]', '', 'g') = ${phoneDigits}`,
        ),
      });
      if (existing) {
        return { id: existing.id, created: false };
      }

      const [row] = await tx
        .insert(leads)
        .values({
          projectId,
          name: input.name,
          email: input.email,
          phone: input.phone,
          stage: input.stage,
          score: input.score,
          company: input.company,
          source: input.source,
          estimatedValue: input.estimatedValue,
          notes: input.notes,
          assignedUserId: input.assignedUserId,
          clientId: input.clientId,
          interestProductId: input.interestProductId,
          lastContactAt: input.lastContactAt,
          contactPosition: input.contactPosition ?? null,
          origin: input.origin ?? 'MANUAL',
        })
        .returning({ id: leads.id });
      return { id: row.id, created: true };
    });

    const lead = await this.findByIdInProject(id, projectId);
    if (!lead) {
      throw new Error(`Lead ${id} vanished right after findOrCreate`);
    }
    return { lead, created };
  }

  async touchLastContactInProject(
    id: string,
    projectId: string,
    at: Date,
  ): Promise<void> {
    await this.db
      .update(leads)
      .set({ lastContactAt: at })
      .where(
        and(
          eq(leads.id, id),
          eq(leads.projectId, projectId),
          or(isNull(leads.lastContactAt), lt(leads.lastContactAt, at)),
        ),
      );
  }

  // Lista los leads del tenant, paginado. Los filtros son AND entre sí y se
  // construyen sobre una base que ya incluye project_id, de forma que ningún
  // filtro puede abrir la consulta a datos de otro proyecto.
  async listByProject(
    projectId: string,
    filter: ListLeadsFilter = {},
  ): Promise<PaginatedLeads> {
    const conditions: SQL[] = [eq(leads.projectId, projectId)];

    if (filter.stage) {
      conditions.push(eq(leads.stage, filter.stage));
    }

    if (filter.stages && filter.stages.length > 0) {
      conditions.push(inArray(leads.stage, filter.stages));
    }

    if (filter.assignedUserId) {
      conditions.push(eq(leads.assignedUserId, filter.assignedUserId));
    }

    if (filter.source) {
      conditions.push(eq(leads.source, filter.source));
    }

    if (filter.clientId) {
      conditions.push(eq(leads.clientId, filter.clientId));
    }

    if (filter.createdFrom) {
      conditions.push(gte(leads.createdAt, filter.createdFrom));
    }

    if (filter.createdTo) {
      conditions.push(lt(leads.createdAt, filter.createdTo));
    }

    if (filter.search) {
      // ILIKE cubre mayúsculas y minúsculas. Se escapan los comodines para que
      // un usuario pueda buscar literalmente un "%".
      const pattern = `%${this.escapeLikePattern(filter.search)}%`;
      const searchCondition = or(
        ilike(leads.name, pattern),
        ilike(leads.email, pattern),
        ilike(leads.phone, pattern),
        ilike(leads.company, pattern),
      );

      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const where = and(...conditions);

    // El total se cuenta con el MISMO where que las filas, incluido el
    // project_id: contar sin él filtraría metadatos de otros tenants.
    const [totalRow] = await this.db
      .select({ value: count() })
      .from(leads)
      .where(where);

    const limit = Math.min(
      Math.max(filter.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const page = Math.max(filter.page ?? 1, 1);

    const rows = await this.db.query.leads.findMany({
      where,
      with: WITH_REFS,
      orderBy: this.orderBy(filter),
      limit,
      offset: (page - 1) * limit,
    });

    const next = await this.nextFollowUps(
      rows.map((row) => row.id),
      projectId,
    );
    return {
      leads: rows.map((row) => this.mapToEntity(row, next.get(row.id))),
      total: totalRow?.value ?? 0,
    };
  }

  // El projectId viene del contexto autorizado (nunca del body del cliente).
  // clientId e interestProductId los ata al proyecto la FK compuesta.
  async create(input: CreateLeadInput): Promise<LeadEntity> {
    const [row] = await this.db
      .insert(leads)
      .values({
        projectId: input.projectId,
        name: input.name,
        email: input.email,
        phone: input.phone,
        stage: input.stage,
        score: input.score,
        company: input.company,
        source: input.source,
        estimatedValue: input.estimatedValue,
        notes: input.notes,
        assignedUserId: input.assignedUserId,
        clientId: input.clientId,
        interestProductId: input.interestProductId,
        lastContactAt: input.lastContactAt,
        contactPosition: input.contactPosition ?? null,
        origin: input.origin ?? 'MANUAL',
      })
      .returning();

    return (
      (await this.findByIdInProject(row.id, input.projectId)) ??
      this.mapToEntity(row)
    );
  }

  // El projectId está en el WHERE del UPDATE, no solo en el input: así el
  // update nunca alcanza una fila de otro tenant. Si no hay fila, devuelve null
  // y el use-case lo traduce a 404.
  async updateInProject(
    id: string,
    projectId: string,
    input: UpdateLeadInput,
  ): Promise<LeadEntity | null> {
    const changes = this.toColumnPatch(input);

    if (Object.keys(changes).length > 0) {
      const updated = await this.db
        .update(leads)
        .set(changes)
        .where(and(eq(leads.id, id), eq(leads.projectId, projectId)))
        .returning({ id: leads.id });

      if (updated.length === 0) {
        return null;
      }
    }

    return this.findByIdInProject(id, projectId);
  }

  async linkClientInProject(
    id: string,
    projectId: string,
    clientId: string,
    stage?: LeadStage,
  ): Promise<LeadEntity | null> {
    const updated = await this.db
      .update(leads)
      .set({ clientId, ...(stage ? { stage } : {}) })
      .where(
        and(
          eq(leads.id, id),
          eq(leads.projectId, projectId),
          isNull(leads.clientId),
        ),
      )
      .returning({ id: leads.id });

    if (updated.length === 0) {
      return null;
    }

    return this.findByIdInProject(id, projectId);
  }

  // Borrado atómico y protegido (ver LeadRepository.deleteInProject). El
  // projectId está en el WHERE del DELETE.
  async deleteInProject(
    id: string,
    projectId: string,
  ): Promise<DeleteLeadResult> {
    // Las guardas viajan en el MISMO DELETE: no hay hueco entre comprobar y
    // borrar. Cuentan como historial: cotizaciones fuera de DRAFT, mensajes
    // (registro de auditoría) y haber originado un cliente (conversión).
    let deleted: { id: string }[];
    try {
      deleted = await this.db
        .delete(leads)
        .where(
          and(
            eq(leads.id, id),
            eq(leads.projectId, projectId),
            notExists(
              this.db
                .select({ one: sql`1` })
                .from(quotes)
                .where(
                  and(
                    eq(quotes.leadId, leads.id),
                    eq(quotes.projectId, leads.projectId),
                    ne(quotes.status, 'DRAFT'),
                  ),
                ),
            ),
            notExists(
              this.db
                .select({ one: sql`1` })
                .from(messages)
                .where(
                  and(
                    eq(messages.leadId, leads.id),
                    eq(messages.projectId, leads.projectId),
                  ),
                ),
            ),
            notExists(
              this.db
                .select({ one: sql`1` })
                .from(clients)
                .where(
                  and(
                    eq(clients.sourceLeadId, leads.id),
                    eq(clients.projectId, leads.projectId),
                  ),
                ),
            ),
          ),
        )
        .returning({ id: leads.id });
    } catch (error) {
      // Red de seguridad de la base: si una carrera (p. ej. un mensaje que
      // llega mientras corre el DELETE) viola una FK NO ACTION, no se borra
      // nada y se responde como "tiene historial".
      if (isForeignKeyViolation(error)) {
        return 'HAS_HISTORY';
      }
      throw error;
    }

    if (deleted.length > 0) {
      return 'DELETED';
    }

    const existing = await this.db.query.leads.findFirst({
      where: and(eq(leads.id, id), eq(leads.projectId, projectId)),
      columns: { id: true },
    });
    return existing ? 'HAS_HISTORY' : 'NOT_FOUND';
  }

  // Orden pedido + id como desempate (paginación estable). Los valores nulos
  // (sin valor estimado, sin último contacto) van siempre al final.
  private orderBy(filter: ListLeadsFilter): SQL[] {
    if (!filter.sortBy) {
      return [asc(leads.createdAt), asc(leads.name), asc(leads.id)];
    }

    const column = {
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
      name: leads.name,
      estimatedValue: leads.estimatedValue,
      lastContactAt: leads.lastContactAt,
    }[filter.sortBy];
    const direction = filter.order === 'desc' ? sql`desc` : sql`asc`;

    return [sql`${column} ${direction} nulls last`, asc(leads.id)];
  }

  // Traduce el input opcional del dominio a un patch de columnas. Se descartan
  // las claves con valor undefined para no sobrescribir con NULL; un null
  // explícito sí se escribe, que es como se borra un campo.
  private toColumnPatch(input: UpdateLeadInput) {
    const changes: Partial<typeof leads.$inferInsert> = {};

    if (input.name !== undefined) changes.name = input.name;
    if (input.email !== undefined) changes.email = input.email;
    if (input.phone !== undefined) changes.phone = input.phone;
    if (input.stage !== undefined) changes.stage = input.stage;
    if (input.score !== undefined) changes.score = input.score;
    if (input.company !== undefined) changes.company = input.company;
    if (input.source !== undefined) changes.source = input.source;
    if (input.estimatedValue !== undefined)
      changes.estimatedValue = input.estimatedValue;
    if (input.notes !== undefined) changes.notes = input.notes;
    if (input.assignedUserId !== undefined)
      changes.assignedUserId = input.assignedUserId;
    if (input.clientId !== undefined) changes.clientId = input.clientId;
    if (input.interestProductId !== undefined)
      changes.interestProductId = input.interestProductId;
    if (input.lastContactAt !== undefined)
      changes.lastContactAt = input.lastContactAt;
    if (input.contactPosition !== undefined)
      changes.contactPosition = input.contactPosition;

    return changes;
  }

  // Escapa los comodines de LIKE para que la búsqueda sea literal. Sin esto,
  // buscar "%" devolvería todos los leads del tenant.
  private escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
  }

  private mapToEntity(row: LeadRowWithRefs, nextFollowUpAt?: Date): LeadEntity {
    return new LeadEntity({
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      email: row.email,
      phone: row.phone,
      stage: row.stage,
      score: row.score,
      company: row.company,
      contactPosition: row.contactPosition,
      source: row.source,
      origin: row.origin as RecordOrigin,
      estimatedValue: row.estimatedValue,
      notes: row.notes,
      assignedUserId: row.assignedUserId,
      clientId: row.clientId,
      interestProductId: row.interestProductId,
      lastContactAt: row.lastContactAt,
      creadoEn: row.createdAt,
      actualizadoEn: row.updatedAt,
      assignedUser: row.assignedUser ?? null,
      client: row.client ?? null,
      interestProduct: row.interestProduct ?? null,
      nextFollowUpAt: nextFollowUpAt ?? null,
    });
  }
}
