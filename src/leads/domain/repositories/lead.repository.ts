import type {
  LeadId,
  LeadSource,
  LeadStage,
  RecordOrigin,
} from '@flowcommerce/types';
import type { LeadEntity } from '../entities/lead.entity';

export interface CreateLeadInput {
  projectId: string;
  name: string;
  email: string | null;
  phone: string | null;
  stage: LeadStage;
  score: number;
  company: string | null;
  source: LeadSource | null;
  estimatedValue: number | null;
  notes: string | null;
  assignedUserId: string | null;
  clientId: string | null;
  interestProductId: string | null;
  lastContactAt: Date | null;
  // Opcionales: null y MANUAL si no llegan.
  contactPosition?: string | null;
  origin?: RecordOrigin;
}

export type DeleteLeadResult = 'DELETED' | 'NOT_FOUND' | 'HAS_HISTORY';

export const LEAD_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'estimatedValue',
  'lastContactAt',
] as const;
export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

// Filtros del listado. Todos son opcionales y TODOS se combinan con AND sobre
// una condición previa de projectId: el tenant es obligatorio y nunca se
// sustituye por un filtro.
export interface ListLeadsFilter {
  stage?: LeadStage;
  // Varias etapas a la vez (OR entre ellas). Se combina con `stage` si llegan ambos.
  stages?: LeadStage[];
  // Búsqueda por texto libre sobre nombre, email, teléfono y empresa.
  search?: string;
  assignedUserId?: string;
  source?: LeadSource;
  clientId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  // Sin sortBy se mantiene el orden histórico: creación ascendente.
  sortBy?: LeadSortField;
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

// Campos mutables de un lead. Todos opcionales: el use-case decide si el
// UpdateLeadDto llegó vacío. El projectId NO se puede cambiar: un lead
// pertenece a un tenant y moverlo entre proyectos rompería el aislamiento.
export interface UpdateLeadInput {
  name?: string;
  email?: string | null;
  phone?: string | null;
  stage?: LeadStage;
  score?: number;
  company?: string | null;
  source?: LeadSource | null;
  estimatedValue?: number | null;
  notes?: string | null;
  assignedUserId?: string | null;
  clientId?: string | null;
  interestProductId?: string | null;
  lastContactAt?: Date | null;
  contactPosition?: string | null;
}

// Listado paginado: las filas del tenant en la página pedida, más el total de
// filas del tenant para que la capa de presentación pueda calcular las páginas.
export interface PaginatedLeads {
  leads: LeadEntity[];
  total: number;
}

// Almacén de leads con ámbito de tenant. Cada lectura DEBE incluir el
// `projectId` para que las operaciones nunca crucen la frontera del proyecto,
// aunque el llamador conozca el id global (defensa frente a IDOR/BOLA).
// Por eso no existe un `findById(id)` sin proyecto: el ámbito forma parte del
// nombre del método, de modo que la restricción se ve al leer la firma.
export interface LeadRepository {
  findByIdInProject(id: LeadId, projectId: string): Promise<LeadEntity | null>;
  // Localiza un lead por el número en dígitos (sin '+'/espacios) DENTRO del
  // proyecto. El webhook de WhatsApp no trae leadId: hay que casar el `from`
  // con un teléfono del tenant, nunca con un listado global.
  findByPhoneDigitsInProject(
    phoneDigits: string,
    projectId: string,
  ): Promise<LeadEntity | null>;
  listByProject(
    projectId: string,
    filter?: ListLeadsFilter,
  ): Promise<PaginatedLeads>;
  // Webhook de WhatsApp: devuelve el lead del tenant con ese número o, si no
  // existe, lo crea con `input`. Es atómico: dos mensajes simultáneos del
  // mismo número nuevo no pueden crear dos leads.
  findOrCreateByPhoneInProject(
    phoneDigits: string,
    projectId: string,
    input: CreateLeadInput,
  ): Promise<{ lead: LeadEntity; created: boolean }>;
  // Actualiza solo last_contact_at (al enviar o recibir un mensaje). Nunca
  // retrocede: si ya había un contacto posterior, se conserva.
  touchLastContactInProject(
    id: LeadId,
    projectId: string,
    at: Date,
  ): Promise<void>;
  create(input: CreateLeadInput): Promise<LeadEntity>;
  // Devuelve null si el lead no existe EN ESE proyecto. Un lead de otro tenant
  // devuelve null igual que uno inexistente, para que el 404 sea indistinguible.
  updateInProject(
    id: LeadId,
    projectId: string,
    input: UpdateLeadInput,
  ): Promise<LeadEntity | null>;
  // Vincula el lead a un cliente SOLO si aún no tenía cliente (WHERE
  // client_id IS NULL): dos conversiones simultáneas no pueden ganar ambas.
  // null = no existe en el proyecto o ya estaba convertido.
  linkClientInProject(
    id: LeadId,
    projectId: string,
    clientId: string,
    stage?: LeadStage,
  ): Promise<LeadEntity | null>;
  // Borrado ATÓMICO y protegido: el DELETE solo actúa si el lead NO tiene
  // historial comercial, es decir, ninguna cotización fuera de DRAFT, ningún
  // mensaje y ningún cliente originado por su conversión. Los borradores sí
  // caen con el lead (ON DELETE CASCADE).
  //   DELETED     -> borrado.
  //   NOT_FOUND   -> no existe en ese proyecto.
  //   HAS_HISTORY -> existe pero tiene cotizaciones en curso/cerradas o
  //                  mensajes; no se toca nada.
  deleteInProject(id: LeadId, projectId: string): Promise<DeleteLeadResult>;
}

export const LEADS_REPOSITORY = Symbol('LEADS_REPOSITORY');
