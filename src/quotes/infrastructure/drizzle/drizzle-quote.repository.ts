import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  ilike,
  lt,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { QuoteItem, RecordOrigin } from '@flowcommerce/types';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { ConflictException } from '../../../common/exceptions/domain.exceptions';
import {
  isUniqueViolation,
  violatedConstraint,
} from '../../../common/utils/postgres-error';
import {
  clients,
  leads,
  quoteFolioCounters,
  quoteItems,
  quotes,
  type QuoteItemRow,
  type QuoteRow,
} from '../../../db/schema';
import { QuoteEntity } from '../../domain/entities/quote.entity';
import { TRANSITION_TIMESTAMP_FIELD } from '../../domain/quote-transitions';
import type {
  CreateQuoteInput,
  ListQuotesFilter,
  PaginatedQuotes,
  QuoteItemDraft,
  QuoteRepository,
  TransitionQuoteInput,
  UpdateDraftQuoteInput,
} from '../../domain/repositories/quote.repository';

// Límite duro por página, alineado con PaginationQueryDto. El repositorio se
// defiende por si algún llamante interno lo invoca sin pasar por el DTO.
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

// Ancho del folio (COT-000123). El prefijo viene de los ajustes del proyecto.
const FOLIO_UNIQUE_CONSTRAINT = 'quotes_project_id_folio_unique';
const FOLIO_MAX_ATTEMPTS = 3;
const FOLIO_DIGITS = 6;

type QuoteRowWithRefs = QuoteRow & {
  lead?: { id: string; name: string } | null;
  client?: { id: string; name: string } | null;
  createdBy?: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
  } | null;
  items?: QuoteItemRow[];
};

// Datos del asesor que se cargan con cada cotización (N6).
const ADVISOR_COLUMNS = {
  columns: { id: true, name: true, email: true, phone: true },
} as const;

@Injectable()
export class DrizzleQuoteRepository implements QuoteRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  // El projectId va SIEMPRE en el WHERE. Un id válido pero de otro tenant
  // devuelve null y el use-case lo traduce a 404 indistinguible.
  async findByIdInProject(
    id: string,
    projectId: string,
  ): Promise<QuoteEntity | null> {
    const row = await this.db.query.quotes.findFirst({
      where: and(eq(quotes.id, id), eq(quotes.projectId, projectId)),
      with: {
        lead: { columns: { id: true, name: true } },
        client: { columns: { id: true, name: true } },
        createdBy: ADVISOR_COLUMNS,
        items: { orderBy: (item) => [asc(item.position)] },
      },
    });

    return row ? this.mapToEntity(row) : null;
  }

  // Lista cotizaciones del tenant con filtros opcionales combinados por AND
  // sobre una base que ya incluye project_id.
  async listByProject(
    projectId: string,
    filter: ListQuotesFilter = {},
  ): Promise<PaginatedQuotes> {
    const conditions: SQL[] = [eq(quotes.projectId, projectId)];

    if (filter.status) {
      conditions.push(eq(quotes.status, filter.status));
    }
    if (filter.clientId) {
      conditions.push(eq(quotes.clientId, filter.clientId));
    }
    if (filter.leadId) {
      conditions.push(eq(quotes.leadId, filter.leadId));
    }
    if (filter.createdByUserId) {
      conditions.push(eq(quotes.createdByUserId, filter.createdByUserId));
    }
    if (filter.origin) {
      conditions.push(eq(quotes.origin, filter.origin));
    }
    if (filter.search) {
      // Folio, nombre del lead o nombre/empresa del cliente (N5). Las
      // subconsultas también llevan project_id: nunca miran otro tenant.
      const pattern = `%${this.escapeLikePattern(filter.search)}%`;
      const bySearch = or(
        ilike(quotes.folio, pattern),
        exists(
          this.db
            .select({ one: sql`1` })
            .from(leads)
            .where(
              and(
                eq(leads.id, quotes.leadId),
                eq(leads.projectId, quotes.projectId),
                ilike(leads.name, pattern),
              ),
            ),
        ),
        exists(
          this.db
            .select({ one: sql`1` })
            .from(clients)
            .where(
              and(
                eq(clients.id, quotes.clientId),
                eq(clients.projectId, quotes.projectId),
                or(
                  ilike(clients.name, pattern),
                  ilike(clients.company, pattern),
                ),
              ),
            ),
        ),
      );
      if (bySearch) {
        conditions.push(bySearch);
      }
    }
    if (filter.from) {
      conditions.push(gte(quotes.createdAt, filter.from));
    }
    if (filter.to) {
      conditions.push(lt(quotes.createdAt, filter.to));
    }

    const where = and(...conditions);

    // El total y la suma de importes se calculan con el MISMO where que las
    // filas ("54 cotizaciones · Q684,300 valor total"). La suma la hace
    // PostgreSQL en numeric exacto.
    const [totalRow] = await this.db
      .select({
        value: count(),
        sumTotal: sql<string>`coalesce(sum(${quotes.total}), 0)`,
      })
      .from(quotes)
      .where(where);

    const limit = Math.min(
      Math.max(filter.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const page = Math.max(filter.page ?? 1, 1);

    const column = {
      createdAt: quotes.createdAt,
      total: quotes.total,
      folio: quotes.folio,
    }[filter.sortBy ?? 'createdAt'];
    const direction = filter.order === 'desc' ? desc : asc;

    const rows = await this.db.query.quotes.findMany({
      where,
      with: {
        lead: { columns: { id: true, name: true } },
        client: { columns: { id: true, name: true } },
        createdBy: ADVISOR_COLUMNS,
      },
      // El folio desempata para que la paginación sea estable.
      orderBy: [direction(column), asc(quotes.folio)],
      limit,
      offset: (page - 1) * limit,
    });

    return {
      quotes: rows.map((row) => this.mapToEntity(row)),
      total: totalRow?.value ?? 0,
      sumTotal: Number(totalRow?.sumTotal ?? 0),
    };
  }

  // Folio + cotización + partidas en UNA transacción. El contador es un upsert
  // atómico: dos peticiones simultáneas se serializan sobre la fila del
  // proyecto y nunca reciben el mismo número; si algo falla, el rollback
  // devuelve también el número.
  // El folio sale del contador del proyecto. Si choca con un folio que ya
  // existe (por ejemplo, cotizaciones antiguas creadas antes del contador),
  // la transacción falla entera, se re-sincroniza el contador con el número
  // más alto usado y se reintenta. Nunca responde 500 por un folio repetido.
  async create(input: CreateQuoteInput): Promise<QuoteEntity> {
    for (let attempt = 1; ; attempt++) {
      try {
        const id = await this.insertWithNextFolio(input);
        return this.requireQuote(id, input.projectId);
      } catch (error) {
        const folioClash =
          isUniqueViolation(error) &&
          violatedConstraint(error) === FOLIO_UNIQUE_CONSTRAINT;
        if (!folioClash) {
          throw error;
        }
        if (attempt >= FOLIO_MAX_ATTEMPTS) {
          throw new ConflictException(
            'Could not allocate a quote folio, retry',
          );
        }
        await this.resyncFolioCounter(input.projectId);
      }
    }
  }

  // Lleva el contador al número más alto ya usado en los folios del proyecto
  // (la parte numérica final: COT-000123 → 123). GREATEST: nunca retrocede.
  private async resyncFolioCounter(projectId: string): Promise<void> {
    const maxUsed = sql<number>`(
      select coalesce(max(nullif(substring(${quotes.folio} from '([0-9]+)$'), '')::int), 0)
      from ${quotes} where ${quotes.projectId} = ${projectId}
    )`;
    await this.db
      .insert(quoteFolioCounters)
      .values({ projectId, lastNumber: maxUsed })
      .onConflictDoUpdate({
        target: quoteFolioCounters.projectId,
        set: {
          lastNumber: sql`greatest(${quoteFolioCounters.lastNumber}, excluded.last_number)`,
        },
      });
  }

  private async insertWithNextFolio(input: CreateQuoteInput): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [counter] = await tx
        .insert(quoteFolioCounters)
        .values({ projectId: input.projectId, lastNumber: 1 })
        .onConflictDoUpdate({
          target: quoteFolioCounters.projectId,
          set: { lastNumber: sql`${quoteFolioCounters.lastNumber} + 1` },
        })
        .returning({ value: quoteFolioCounters.lastNumber });

      const folio = `${input.folioPrefix}-${String(counter.value).padStart(FOLIO_DIGITS, '0')}`;

      const [row] = await tx
        .insert(quotes)
        .values({
          projectId: input.projectId,
          leadId: input.leadId,
          clientId: input.clientId,
          createdByUserId: input.createdByUserId,
          folio,
          subtotal: input.totals.subtotal,
          discount: input.totals.discount,
          adjustment: input.totals.adjustment,
          taxPercent: input.totals.taxPercent,
          tax: input.totals.tax,
          total: input.totals.total,
          status: 'DRAFT',
          validUntil: input.validUntil,
          notes: input.notes,
          terms: input.terms,
          origin: input.origin ?? 'MANUAL',
        })
        .returning({ id: quotes.id });

      await this.insertItems(tx, row.id, input.projectId, input.items);
      return row.id;
    });
  }

  // Solo toca la cotización si SIGUE en DRAFT (el WHERE lo comprueba en la
  // misma sentencia): una edición concurrente a una transición no puede
  // modificar una cotización ya enviada a aprobación.
  async updateDraftInProject(
    id: string,
    projectId: string,
    input: UpdateDraftQuoteInput,
  ): Promise<QuoteEntity | null> {
    const changes: Partial<typeof quotes.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.clientId !== undefined) changes.clientId = input.clientId;
    if (input.validUntil !== undefined) changes.validUntil = input.validUntil;
    if (input.notes !== undefined) changes.notes = input.notes;
    if (input.terms !== undefined) changes.terms = input.terms;
    if (input.totals) {
      changes.subtotal = input.totals.subtotal;
      changes.discount = input.totals.discount;
      changes.adjustment = input.totals.adjustment;
      changes.taxPercent = input.totals.taxPercent;
      changes.tax = input.totals.tax;
      changes.total = input.totals.total;
    }

    const found = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(quotes)
        .set(changes)
        .where(
          and(
            eq(quotes.id, id),
            eq(quotes.projectId, projectId),
            eq(quotes.status, 'DRAFT'),
          ),
        )
        .returning({ id: quotes.id });

      if (!row) {
        return false;
      }

      if (input.items) {
        await tx
          .delete(quoteItems)
          .where(
            and(
              eq(quoteItems.quoteId, id),
              eq(quoteItems.projectId, projectId),
            ),
          );
        await this.insertItems(tx, id, projectId, input.items);
      }
      return true;
    });

    return found ? this.findByIdInProject(id, projectId) : null;
  }

  // Las partidas caen en cascada por la FK compuesta.
  async deleteDraftInProject(id: string, projectId: string): Promise<boolean> {
    const deleted = await this.db
      .delete(quotes)
      .where(
        and(
          eq(quotes.id, id),
          eq(quotes.projectId, projectId),
          eq(quotes.status, 'DRAFT'),
        ),
      )
      .returning({ id: quotes.id });

    return deleted.length > 0;
  }

  // UPDATE ... WHERE id AND project_id AND status = $esperado RETURNING: si dos
  // peticiones compiten, solo una encuentra el estado esperado.
  async transitionStatusInProject(
    id: string,
    projectId: string,
    input: TransitionQuoteInput,
  ): Promise<QuoteEntity | null> {
    const changes: Partial<typeof quotes.$inferInsert> = {
      status: input.to,
      updatedAt: input.at,
    };
    const field =
      TRANSITION_TIMESTAMP_FIELD[
        input.to as keyof typeof TRANSITION_TIMESTAMP_FIELD
      ];
    if (field) {
      changes[field] = input.at;
    }
    if (input.paymentReference !== undefined) {
      changes.paymentReference = input.paymentReference;
    }

    // Una cotización ACCEPTED es un negocio ganado: el lead pasa a WON en la
    // MISMA transacción, así que el KPI "ganado" y la conversión del Dashboard
    // no dependen de moverlo a mano y nunca quedan a medias.
    const updatedId = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .update(quotes)
        .set(changes)
        .where(
          and(
            eq(quotes.id, id),
            eq(quotes.projectId, projectId),
            eq(quotes.status, input.from),
          ),
        )
        .returning({ id: quotes.id, leadId: quotes.leadId });

      if (!row) {
        return null;
      }

      if (input.to === 'ACCEPTED') {
        await tx
          .update(leads)
          .set({ stage: 'WON' })
          .where(and(eq(leads.id, row.leadId), eq(leads.projectId, projectId)));
      }
      return row.id;
    });

    return updatedId ? this.findByIdInProject(id, projectId) : null;
  }

  // Guarda el link de pago que creó el servicio de Pagos. Solo en cotizaciones
  // ACCEPTED (las únicas que se pueden cobrar).
  async setPaymentLinkInProject(
    id: string,
    projectId: string,
    url: string,
  ): Promise<QuoteEntity | null> {
    const [row] = await this.db
      .update(quotes)
      .set({ paymentLinkUrl: url, updatedAt: new Date() })
      .where(
        and(
          eq(quotes.id, id),
          eq(quotes.projectId, projectId),
          eq(quotes.status, 'ACCEPTED'),
        ),
      )
      .returning({ id: quotes.id });
    return row ? this.findByIdInProject(id, projectId) : null;
  }

  private async insertItems(
    tx: Pick<Database, 'insert'>,
    quoteId: string,
    projectId: string,
    items: QuoteItemDraft[],
  ): Promise<void> {
    if (items.length === 0) {
      return;
    }
    await tx.insert(quoteItems).values(
      items.map((item) => ({
        quoteId,
        projectId,
        productId: item.productId,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        lineTotal: item.lineTotal,
        position: item.position,
      })),
    );
  }

  private async requireQuote(
    id: string,
    projectId: string,
  ): Promise<QuoteEntity> {
    const quote = await this.findByIdInProject(id, projectId);
    if (!quote) {
      throw new Error(`Quote ${id} vanished right after being written`);
    }
    return quote;
  }

  // Escapa los comodines de LIKE para que la búsqueda sea literal.
  private escapeLikePattern(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`);
  }

  private mapToEntity(row: QuoteRowWithRefs): QuoteEntity {
    return new QuoteEntity({
      id: row.id,
      projectId: row.projectId,
      leadId: row.leadId,
      clientId: row.clientId,
      folio: row.folio,
      subtotal: row.subtotal,
      discount: row.discount,
      adjustment: row.adjustment,
      taxPercent: row.taxPercent,
      tax: row.tax,
      total: row.total,
      status: row.status,
      validUntil: row.validUntil,
      notes: row.notes,
      terms: row.terms,
      createdByUserId: row.createdByUserId,
      approvedAt: row.approvedAt,
      sentAt: row.sentAt,
      acceptedAt: row.acceptedAt,
      rejectedAt: row.rejectedAt,
      paidAt: row.paidAt,
      origin: row.origin as RecordOrigin,
      paymentLinkUrl: row.paymentLinkUrl,
      paymentReference: row.paymentReference,
      creadoEn: row.createdAt,
      actualizadoEn: row.updatedAt,
      lead: row.lead ?? null,
      client: row.client ?? null,
      createdBy: row.createdBy ?? null,
      items: row.items?.map((item): QuoteItem => this.mapItem(item)),
    });
  }

  private mapItem(item: QuoteItemRow): QuoteItem {
    return {
      id: item.id,
      quoteId: item.quoteId,
      productId: item.productId,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      discountPercent: item.discountPercent,
      lineTotal: item.lineTotal,
      position: item.position,
    };
  }
}
