import type {
  LeadStage,
  MessageDirection,
  MessageType,
} from '@flowcommerce/types';
import type { MessageEntity } from '../entities/message.entity';

export interface CreateMessageInput {
  projectId: string;
  leadId: string;
  whatsappMessageId: string;
  direction: MessageDirection;
  content: string;
  status: string;
  // TEXT si no llega.
  type?: MessageType;
  templateName?: string | null;
  attachmentId?: string | null;
}

// Página del historial de un chat (paginación por cursor, ver
// listByLeadInProject).
export interface LeadMessagesPage {
  // Del más antiguo al más reciente, para pintarlos tal cual en el chat.
  messages: MessageEntity[];
  // true si hay mensajes más antiguos que el primero de esta página.
  hasMore: boolean;
}

export interface ListConversationsFilter {
  // Texto libre sobre nombre, teléfono o empresa del lead.
  search?: string;
  // true = solo conversaciones con mensajes del cliente sin leer.
  unread?: boolean;
  page?: number;
  limit?: number;
}

// Una fila de la bandeja de conversaciones: un lead con al menos un mensaje.
export interface ConversationSummary {
  lead: {
    id: string;
    name: string;
    phone: string | null;
    company: string | null;
    stage: LeadStage;
  };
  lastMessage: MessageEntity;
  unreadCount: number;
  // Último mensaje del CLIENTE (INBOUND): abre la ventana de 24 h.
  lastInboundAt: Date | null;
}

export interface PaginatedConversations {
  conversations: ConversationSummary[];
  total: number;
}

export interface UnreadCounts {
  // Conversaciones con al menos un mensaje sin leer.
  conversations: number;
  // Mensajes INBOUND sin leer en todo el proyecto.
  messages: number;
}

// Almacén de mensajes con ámbito de tenant. Igual que en leads y quotes, TODA
// lectura DEBE recibir el `projectId`: no existe un `findByLeadId(leadId)`
// global, porque un lead de otro tenant se identificaría igual que uno propio.
// El ámbito forma parte de la firma, de modo que la restricción se ve al leer
// el puerto.
export interface MessagesRepository {
  create(input: CreateMessageInput): Promise<MessageEntity>;
  // Idempotente para reintentos del webhook: si el wamid ya existe en el
  // tenant, no duplica la fila. Devuelve null cuando el conflicto es de otro
  // proyecto (el índice único es global) para no cruzar tenants.
  createIfNotExists(input: CreateMessageInput): Promise<MessageEntity | null>;
  findByWhatsappMessageIdInProject(
    whatsappMessageId: string,
    projectId: string,
  ): Promise<MessageEntity | null>;
  // errorMessage solo se guarda con FAILED; con otro estado se limpia.
  updateStatusInProject(
    whatsappMessageId: string,
    projectId: string,
    status: string,
    errorMessage?: string | null,
  ): Promise<MessageEntity | null>;
  // Historial de un lead, del más reciente hacia atrás, de `limit` en `limit`.
  // `before` es el id del mensaje más antiguo que ya tiene el frontend: se
  // devuelven los anteriores a él. Si el lead no existe en el proyecto
  // devuelve una página vacía: el 404 lo decide el use-case, no el almacén.
  listByLeadInProject(
    leadId: string,
    projectId: string,
    options: { before?: string; limit: number },
  ): Promise<LeadMessagesPage>;
  // Fecha del último mensaje INBOUND del lead (ventana de 24 h), o null.
  findLastInboundAtInProject(
    leadId: string,
    projectId: string,
  ): Promise<Date | null>;
  // Marca como leídos los INBOUND pendientes del lead. Devuelve cuántos.
  markInboundAsReadInProject(
    leadId: string,
    projectId: string,
    readAt: Date,
  ): Promise<number>;
  // Bandeja: leads con mensajes, el de actividad más reciente primero.
  listConversationsInProject(
    projectId: string,
    filter?: ListConversationsFilter,
  ): Promise<PaginatedConversations>;
  countUnreadInProject(projectId: string): Promise<UnreadCounts>;
  // Asocia el archivo descargado a un mensaje recibido, solo si aún no tenía
  // (WHERE attachment_id IS NULL). false = ya tenía uno (reintento del webhook).
  setAttachmentIfEmptyInProject(
    messageId: string,
    projectId: string,
    attachmentId: string,
  ): Promise<boolean>;
}

export const MESSAGES_REPOSITORY = Symbol('MESSAGES_REPOSITORY');
