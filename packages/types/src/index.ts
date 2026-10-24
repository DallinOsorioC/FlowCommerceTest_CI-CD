export type UserId = string;
export type ProjectId = string;
export type MembershipId = string;

export const Role = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MEMBER: 'MEMBER',
  VIEWER: 'VIEWER',
} as const;

export type Role = (typeof Role)[keyof typeof Role];

export const Permission = {
  PROJECT_READ: 'PROJECT_READ',
  PROJECT_CREATE: 'PROJECT_CREATE',
  PROJECT_UPDATE: 'PROJECT_UPDATE',
  PROJECT_DELETE: 'PROJECT_DELETE',
  MEMBER_READ: 'MEMBER_READ',
  MEMBER_INVITE: 'MEMBER_INVITE',
  MEMBER_UPDATE_ROLE: 'MEMBER_UPDATE_ROLE',
  MEMBER_REMOVE: 'MEMBER_REMOVE',
  LEAD_CREATE: 'LEAD_CREATE',
  LEAD_READ: 'LEAD_READ',
  LEAD_UPDATE: 'LEAD_UPDATE',
  LEAD_DELETE: 'LEAD_DELETE',
  QUOTE_CREATE: 'QUOTE_CREATE',
  QUOTE_READ: 'QUOTE_READ',
  QUOTE_APPROVE: 'QUOTE_APPROVE',
  WHATSAPP_SEND_MESSAGE: 'WHATSAPP_SEND_MESSAGE',
  PRODUCT_READ: 'PRODUCT_READ',
  PRODUCT_MANAGE: 'PRODUCT_MANAGE',
  CLIENT_CREATE: 'CLIENT_CREATE',
  CLIENT_READ: 'CLIENT_READ',
  CLIENT_UPDATE: 'CLIENT_UPDATE',
  CLIENT_DELETE: 'CLIENT_DELETE',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export interface Project {
  id: ProjectId;
  name: string;
  slug: string;
  description: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

// Perfil de facturación del proyecto (datos fiscales que salen en cotizaciones).
export interface ProjectBillingProfile {
  legalName: string | null;
  taxId: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
}

// Ajustes que gobiernan las cotizaciones del proyecto.
export interface ProjectQuoteSettings {
  taxPercent: number;
  folioPrefix: string;
  validityDays: number;
  defaultTerms: string | null;
  currency: string;
}

export interface ProjectDetail extends Project {
  billing: ProjectBillingProfile;
  quoteSettings: ProjectQuoteSettings;
}

export interface Membership {
  id: MembershipId;
  userId: UserId;
  projectId: ProjectId;
  role: Role;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface UserMembership {
  project: Project;
  role: Role;
}

export interface User {
  id: UserId;
  name: string;
  email: string;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface SafeUser {
  id: UserId;
  name: string;
  email: string;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface UserProfile extends SafeUser {
  phone: string | null;
  position: string | null;
  // Ruta de la API que sirve la foto de perfil; null si no tiene.
  avatarUrl: string | null;
}

/* ------------------------------------------------------------------ */
/* CRM: leads, quotes y mensajes                                       */
/* ------------------------------------------------------------------ */

// Etapas del embudo. Etiquetas del frontend: NEW = Nuevo, CONTACTED =
// Contactado, QUALIFIED = Seguimiento, PROPOSAL = Cotización, NEGOTIATION =
// Negociación, WON = Ganado, LOST = Perdido.
export const LeadStage = {
  NEW: 'NEW',
  CONTACTED: 'CONTACTED',
  QUALIFIED: 'QUALIFIED',
  PROPOSAL: 'PROPOSAL',
  NEGOTIATION: 'NEGOTIATION',
  WON: 'WON',
  LOST: 'LOST',
} as const;

export type LeadStage = (typeof LeadStage)[keyof typeof LeadStage];

// Origen del lead (filtro «Fuente» del frontend).
export const LeadSource = {
  REFERRAL: 'REFERRAL',
  WEBSITE: 'WEBSITE',
  WHATSAPP: 'WHATSAPP',
  SOCIAL_MEDIA: 'SOCIAL_MEDIA',
  EVENT: 'EVENT',
  COLD_OUTREACH: 'COLD_OUTREACH',
  OTHER: 'OTHER',
} as const;

export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];

export const QuoteStatus = {
  DRAFT: 'DRAFT',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  PAID: 'PAID',
  REJECTED: 'REJECTED',
} as const;

export type QuoteStatus = (typeof QuoteStatus)[keyof typeof QuoteStatus];

export const MessageDirection = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
} as const;

export type MessageDirection =
  (typeof MessageDirection)[keyof typeof MessageDirection];

// Tipo de mensaje de WhatsApp. TEMPLATE = plantilla aprobada por Meta (la única
// forma de escribir fuera de la ventana de 24 h).
export const MessageType = {
  TEXT: 'TEXT',
  TEMPLATE: 'TEMPLATE',
  IMAGE: 'IMAGE',
  DOCUMENT: 'DOCUMENT',
  AUDIO: 'AUDIO',
  VIDEO: 'VIDEO',
  OTHER: 'OTHER',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

// Quién registró un lead o una cotización: una persona del CRM o el servicio
// de IA (integración con API key).
export const RecordOrigin = {
  MANUAL: 'MANUAL',
  AI: 'AI',
} as const;

export type RecordOrigin = (typeof RecordOrigin)[keyof typeof RecordOrigin];

// Historial de actividad (pestaña Actividad del lead, historial del cliente).
export const ActivityType = {
  LEAD_CREATED: 'LEAD_CREATED',
  LEAD_STAGE_CHANGED: 'LEAD_STAGE_CHANGED',
  LEAD_ASSIGNED: 'LEAD_ASSIGNED',
  LEAD_CONVERTED: 'LEAD_CONVERTED',
  CLIENT_CREATED: 'CLIENT_CREATED',
  QUOTE_CREATED: 'QUOTE_CREATED',
  QUOTE_STATUS_CHANGED: 'QUOTE_STATUS_CHANGED',
  QUOTE_SENT_BY_EMAIL: 'QUOTE_SENT_BY_EMAIL',
  QUOTE_PAYMENT_LINK_CREATED: 'QUOTE_PAYMENT_LINK_CREATED',
  MESSAGE_SENT: 'MESSAGE_SENT',
  MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
  FOLLOW_UP_CREATED: 'FOLLOW_UP_CREATED',
  FOLLOW_UP_COMPLETED: 'FOLLOW_UP_COMPLETED',
  FOLLOW_UP_CANCELLED: 'FOLLOW_UP_CANCELLED',
  ATTACHMENT_ADDED: 'ATTACHMENT_ADDED',
} as const;

export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export interface ActivityEvent {
  id: string;
  projectId: ProjectId;
  type: ActivityType;
  title: string;
  // null = lo hizo el sistema (webhook de WhatsApp, IA, Pagos, recordatorios).
  actor: { id: UserId; name: string } | null;
  leadId: string | null;
  clientId: string | null;
  quoteId: string | null;
  metadata: Record<string, unknown>;
  creadoEn: Date;
}

// Archivo adjunto a un lead o cliente (o recibido por WhatsApp).
export const AttachmentSource = {
  UPLOAD: 'UPLOAD',
  WHATSAPP: 'WHATSAPP',
} as const;

export type AttachmentSource =
  (typeof AttachmentSource)[keyof typeof AttachmentSource];

export interface Attachment {
  id: string;
  projectId: ProjectId;
  leadId: string | null;
  clientId: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  source: AttachmentSource;
  uploadedByUserId: UserId | null;
  creadoEn: Date;
}

// Seguimientos (follow-ups) de un lead: llamada, reunión, correo, WhatsApp o
// tarea, con fecha límite.
export const FollowUpType = {
  CALL: 'CALL',
  MEETING: 'MEETING',
  EMAIL: 'EMAIL',
  WHATSAPP: 'WHATSAPP',
  TASK: 'TASK',
} as const;

export type FollowUpType = (typeof FollowUpType)[keyof typeof FollowUpType];

export const FollowUpStatus = {
  PENDING: 'PENDING',
  DONE: 'DONE',
  CANCELLED: 'CANCELLED',
} as const;

export type FollowUpStatus =
  (typeof FollowUpStatus)[keyof typeof FollowUpStatus];

// Tipos de notificación (campana del frontend).
export const NotificationType = {
  QUOTE_PENDING_APPROVAL: 'QUOTE_PENDING_APPROVAL',
  QUOTE_APPROVED: 'QUOTE_APPROVED',
  QUOTE_RETURNED: 'QUOTE_RETURNED',
  QUOTE_ACCEPTED: 'QUOTE_ACCEPTED',
  QUOTE_REJECTED: 'QUOTE_REJECTED',
  QUOTE_PAID: 'QUOTE_PAID',
  QUOTE_EXPIRED: 'QUOTE_EXPIRED',
  MESSAGE_RECEIVED: 'MESSAGE_RECEIVED',
  LEAD_ASSIGNED: 'LEAD_ASSIGNED',
  FOLLOW_UP_DUE: 'FOLLOW_UP_DUE',
  // Lead abierto sin contacto en varios días (lo detecta el job de recordatorios).
  LEAD_STALE: 'LEAD_STALE',
  ACCESS_REQUESTED: 'ACCESS_REQUESTED',
} as const;

export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

// Pestañas de la bandeja de notificaciones: cada una agrupa varios tipos.
export const NotificationCategory = {
  FOLLOW_UP: 'FOLLOW_UP',
  MESSAGE: 'MESSAGE',
  QUOTE: 'QUOTE',
  LEAD: 'LEAD',
} as const;

export type NotificationCategory =
  (typeof NotificationCategory)[keyof typeof NotificationCategory];

export const NOTIFICATION_CATEGORY_TYPES: Record<
  NotificationCategory,
  readonly NotificationType[]
> = {
  FOLLOW_UP: [NotificationType.FOLLOW_UP_DUE],
  MESSAGE: [NotificationType.MESSAGE_RECEIVED],
  QUOTE: [
    NotificationType.QUOTE_PENDING_APPROVAL,
    NotificationType.QUOTE_APPROVED,
    NotificationType.QUOTE_RETURNED,
    NotificationType.QUOTE_ACCEPTED,
    NotificationType.QUOTE_REJECTED,
    NotificationType.QUOTE_PAID,
    NotificationType.QUOTE_EXPIRED,
  ],
  LEAD: [
    NotificationType.LEAD_ASSIGNED,
    NotificationType.LEAD_STALE,
    NotificationType.ACCESS_REQUESTED,
  ],
};

// A qué apunta la notificación (para que el frontend navegue al detalle).
export const NotificationEntity = {
  LEAD: 'LEAD',
  QUOTE: 'QUOTE',
  FOLLOW_UP: 'FOLLOW_UP',
  ACCESS_REQUEST: 'ACCESS_REQUEST',
} as const;

export type NotificationEntity =
  (typeof NotificationEntity)[keyof typeof NotificationEntity];

export type LeadId = string;
export type QuoteId = string;
export type MessageId = string;

export interface Lead {
  id: LeadId;
  projectId: ProjectId;
  name: string;
  email: string | null;
  phone: string | null;
  stage: LeadStage;
  score: number;
  company: string | null;
  // Cargo del contacto en su empresa (N9).
  contactPosition: string | null;
  source: LeadSource | null;
  // MANUAL o AI (registrado por el servicio de IA).
  origin: RecordOrigin;
  // Valor estimado del negocio (antes de IVA). Suma de activos = pipeline.
  estimatedValue: number | null;
  notes: string | null;
  assignedUserId: UserId | null;
  // Cliente al que pertenece (se fija al convertir el lead).
  clientId: string | null;
  // Producto o servicio de interés, del catálogo del proyecto.
  interestProductId: string | null;
  lastContactAt: Date | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

// Partida de cotización. El precio sale del catálogo; line_total ya descuenta
// el descuento de la línea (antes de IVA).
export interface QuoteItem {
  id: string;
  quoteId: QuoteId;
  productId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  lineTotal: number;
  position: number;
}

export interface Quote {
  id: QuoteId;
  projectId: ProjectId;
  leadId: LeadId;
  clientId: string | null;
  folio: string;
  // base = subtotal (bruto) - discount - adjustment; total = base + tax
  subtotal: number;
  discount: number;
  // Ajuste comercial: descuento global de la cotización, antes de IVA.
  adjustment: number;
  // IVA aplicado (copia del ajuste del proyecto al calcular).
  taxPercent: number;
  tax: number;
  total: number;
  status: QuoteStatus;
  validUntil: Date | null;
  notes: string | null;
  terms: string | null;
  createdByUserId: UserId | null;
  approvedAt: Date | null;
  sentAt: Date | null;
  acceptedAt: Date | null;
  rejectedAt: Date | null;
  paidAt: Date | null;
  // MANUAL o AI (generada por el servicio de IA, N7).
  origin: RecordOrigin;
  // Link de pago creado por el servicio de Pagos (null si aún no hay).
  paymentLinkUrl: string | null;
  // Referencia del pago confirmado por el webhook de Pagos.
  paymentReference: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

export interface Message {
  id: MessageId;
  projectId: ProjectId;
  leadId: LeadId;
  whatsappMessageId: string;
  direction: MessageDirection;
  type: MessageType;
  // Texto del mensaje; en plantillas, el texto ya con sus variables; en
  // archivos, el pie de foto o "[documento] nombre.pdf".
  content: string;
  // Solo TEMPLATE.
  templateName: string | null;
  // Archivo del mensaje (se descarga con /attachments/:id/download).
  attachmentId: string | null;
  status: string;
  // Motivo de WhatsApp cuando status = FAILED; null en otro caso.
  errorMessage: string | null;
  // Solo INBOUND: cuándo se leyó en el CRM (null = no leído).
  readAt: Date | null;
  creadoEn: Date;
}

/* ------------------------------------------------------------------ */
/* Catálogo de productos y servicios                                   */
/* ------------------------------------------------------------------ */

export type ProductId = string;

// Producto o servicio del catálogo de un proyecto. El precio es la única fuente
// de verdad para cotizar: las partidas de cotización copian nombre y precio en
// el momento de cotizar, así que cambiar el catálogo no altera cotizaciones
// existentes. Un producto se desactiva, nunca se borra.
export interface Product {
  id: ProductId;
  projectId: ProjectId;
  name: string;
  description: string | null;
  category: string | null;
  unit: string | null;
  price: number;
  maxDiscountPercent: number;
  active: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
}

/* ------------------------------------------------------------------ */
/* Clientes                                                            */
/* ------------------------------------------------------------------ */

export type ClientId = string;

// Cliente (cuenta) del proyecto: una empresa o persona con la que ya hay
// relación comercial. Puede nacer de la conversión de un lead (sourceLeadId).
export interface Client {
  id: ClientId;
  projectId: ProjectId;
  name: string;
  // Cargo del contacto principal (N9).
  contactPosition: string | null;
  company: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  assignedUserId: UserId | null;
  sourceLeadId: LeadId | null;
  active: boolean;
  creadoEn: Date;
  actualizadoEn: Date;
}

/* ------------------------------------------------------------------ */
/* Access requests                                                     */
/* ------------------------------------------------------------------ */

export const AccessRequestStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;

export type AccessRequestStatus =
  (typeof AccessRequestStatus)[keyof typeof AccessRequestStatus];

export type AccessRequestId = string;

export interface AccessRequest {
  id: AccessRequestId;
  projectId: ProjectId;
  email: string;
  status: AccessRequestStatus;
  atendidoEn: Date | null;
  atendidoPorUserId: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
}
