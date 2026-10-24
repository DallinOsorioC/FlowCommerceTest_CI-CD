import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import type { Database } from '../../../db';
import { DATABASE_CLIENT } from '../../../db/database.constants';
import { clients, leads, quotes } from '../../../db/schema';
import type {
  SearchRepository,
  SearchResults,
  SearchScope,
} from '../../domain/search';

// Escapa los comodines de LIKE para que la búsqueda sea literal.
const escapeLike = (value: string) =>
  value.replace(/[\\%_]/g, (char) => `\\${char}`);

// Tres consultas en paralelo (leads, clientes, cotizaciones), cada una con
// project_id en el WHERE y un LIMIT pequeño. Las cotizaciones se buscan por
// folio y por el nombre del lead o del cliente.
@Injectable()
export class DrizzleSearchRepository implements SearchRepository {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly db: Database,
  ) {}

  async search(
    projectId: string,
    term: string,
    scopes: readonly SearchScope[],
    limit: number,
  ): Promise<SearchResults> {
    const pattern = `%${escapeLike(term)}%`;
    const want = (scope: SearchScope) => scopes.includes(scope);

    const [leadRows, clientRows, quoteRows] = await Promise.all([
      want('leads')
        ? this.db
            .select({
              id: leads.id,
              name: leads.name,
              company: leads.company,
              stage: leads.stage,
            })
            .from(leads)
            .where(
              and(
                eq(leads.projectId, projectId),
                or(
                  ilike(leads.name, pattern),
                  ilike(leads.company, pattern),
                  ilike(leads.email, pattern),
                  ilike(leads.phone, pattern),
                ),
              ),
            )
            .orderBy(desc(leads.updatedAt))
            .limit(limit)
        : Promise.resolve([]),
      want('clients')
        ? this.db
            .select({
              id: clients.id,
              name: clients.name,
              company: clients.company,
              taxId: clients.taxId,
            })
            .from(clients)
            .where(
              and(
                eq(clients.projectId, projectId),
                or(
                  ilike(clients.name, pattern),
                  ilike(clients.company, pattern),
                  ilike(clients.email, pattern),
                  ilike(clients.taxId, pattern),
                ),
              ),
            )
            .orderBy(desc(clients.updatedAt))
            .limit(limit)
        : Promise.resolve([]),
      want('quotes')
        ? this.db
            .select({
              id: quotes.id,
              folio: quotes.folio,
              status: quotes.status,
              total: quotes.total,
              leadName: leads.name,
              clientName: clients.name,
            })
            .from(quotes)
            .innerJoin(
              leads,
              and(
                eq(leads.id, quotes.leadId),
                eq(leads.projectId, quotes.projectId),
              ),
            )
            .leftJoin(
              clients,
              and(
                eq(clients.id, quotes.clientId),
                eq(clients.projectId, quotes.projectId),
              ),
            )
            .where(
              and(
                eq(quotes.projectId, projectId),
                or(
                  ilike(quotes.folio, pattern),
                  ilike(leads.name, pattern),
                  ilike(clients.name, pattern),
                ),
              ),
            )
            .orderBy(desc(quotes.createdAt))
            .limit(limit)
        : Promise.resolve([]),
    ]);

    return {
      leads: leadRows,
      clients: clientRows,
      quotes: quoteRows.map((row) => ({
        id: row.id,
        folio: row.folio,
        status: row.status,
        total: row.total,
        customerName: row.clientName ?? row.leadName,
      })),
    };
  }
}
