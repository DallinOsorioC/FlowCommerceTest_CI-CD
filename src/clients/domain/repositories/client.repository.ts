import type { ClientId, LeadStage } from '@flowcommerce/types';
import type { ClientEntity } from '../entities/client.entity';

export interface CreateClientInput {
  projectId: string;
  name: string;
  company: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  assignedUserId: string | null;
  sourceLeadId: string | null;
  contactPosition?: string | null;
}

// Datos para crear un cliente a partir de un lead (conversión).
export interface CreateClientFromLeadInput extends Omit<
  CreateClientInput,
  'sourceLeadId'
> {
  leadId: string;
  // Si viene, el lead pasa también a esta etapa (p. ej. WON).
  leadStage?: LeadStage;
}

// Criterios para detectar un posible duplicado al convertir un lead.
export interface DuplicateCriteria {
  email: string | null;
  company: string | null;
  // El cliente recién creado no cuenta como duplicado de sí mismo.
  excludeId?: string;
}

export interface UpdateClientInput {
  name?: string;
  company?: string | null;
  taxId?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  assignedUserId?: string | null;
  active?: boolean;
  contactPosition?: string | null;
}

export const CLIENT_SORT_FIELDS = ['name', 'createdAt'] as const;
export type ClientSortField = (typeof CLIENT_SORT_FIELDS)[number];

// Filtros siempre ADITIVOS al projectId.
export interface ListClientsFilter {
  // Coincidencia parcial sobre nombre, empresa, email, teléfono y NIT.
  search?: string;
  assignedUserId?: string;
  active?: boolean;
  sortBy?: ClientSortField;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface PaginatedClients {
  clients: ClientEntity[];
  total: number;
}

// Clientes con ámbito de tenant: projectId en la firma y en cada WHERE.
export interface ClientRepository {
  findByIdInProject(
    id: ClientId,
    projectId: string,
  ): Promise<ClientEntity | null>;
  listByProject(
    projectId: string,
    filter?: ListClientsFilter,
  ): Promise<PaginatedClients>;
  create(input: CreateClientInput): Promise<ClientEntity>;
  // Conversión ATÓMICA: en UNA transacción crea el cliente (con sourceLeadId =
  // lead) y vincula el lead a él, solo si el lead no tenía cliente. Devuelve
  // null (y no deja nada escrito) si el lead ya estaba vinculado, ya no existe
  // o perdió una carrera con otra conversión. Un NIT repetido lanza la
  // violación de unicidad.
  createFromLead(
    input: CreateClientFromLeadInput,
  ): Promise<ClientEntity | null>;
  updateInProject(
    id: ClientId,
    projectId: string,
    input: UpdateClientInput,
  ): Promise<ClientEntity | null>;
  // false si no existe en ese proyecto. Lanza violación de FK si el cliente
  // tiene leads o cotizaciones asociadas (el use-case la traduce a 409).
  deleteInProject(id: ClientId, projectId: string): Promise<boolean>;
  // Clientes del proyecto con el mismo email o la misma empresa (sin importar
  // mayúsculas). Informativo: sirve para avisar, nunca para bloquear. Máximo 5.
  findPossibleDuplicatesInProject(
    projectId: string,
    criteria: DuplicateCriteria,
  ): Promise<ClientEntity[]>;
  // Estadísticas comerciales del cliente a partir de sus cotizaciones.
  getStatsInProject(id: ClientId, projectId: string): Promise<ClientStats>;
  // Las mismas estadísticas para varios clientes en UNA consulta (listado de
  // clientes, B10). Los clientes sin cotizaciones no aparecen en el mapa.
  getStatsForClientsInProject(
    ids: readonly ClientId[],
    projectId: string,
  ): Promise<Map<ClientId, ClientStats>>;
  getSummaryInProject(projectId: string, since: Date): Promise<ClientsSummary>;
}

// Números de la cabecera de Clientes. No dependen de los filtros ni de la
// página: son de toda la cartera del proyecto.
export interface ClientsSummary {
  // Clientes con active = true.
  activeClients: number;
  // Suma de quotes.total de las cotizaciones pagadas (paid_at) desde `since`.
  billedSince: number;
}

export interface ClientStats {
  // Todas las cotizaciones del cliente, en cualquier estado.
  quotesCount: number;
  // Cotizaciones pagadas (PAID) y suma de sus totales: las ventas.
  paidQuotesCount: number;
  salesTotal: number;
  // Evento más reciente de su historial de actividad (null si no hay).
  lastActivityAt: Date | null;
}

export const CLIENTS_REPOSITORY = Symbol('CLIENTS_REPOSITORY');
