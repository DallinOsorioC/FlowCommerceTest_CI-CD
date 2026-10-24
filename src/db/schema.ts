import { relations, sql } from 'drizzle-orm';
import {
  type PgTableExtraConfigValue,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

// Perfil de los usuarios del sistema. La identidad (correo, contraseña, sesión)
// vive en Supabase Auth: users.id es el mismo id que auth.users.id.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  // Perfil editable por el propio usuario (PATCH /users/me).
  phone: varchar('phone', { length: 32 }),
  position: varchar('position', { length: 100 }),
  // Foto de perfil: clave del archivo en el almacenamiento (FILE_STORAGE).
  // `image` guarda la URL pública de la API que la sirve.
  avatarKey: varchar('avatar_key', { length: 500 }),
  createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('actualizado_en', {
    withTimezone: true,
    mode: 'date',
  })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// Un proyecto es el tenant: agrupa sus miembros y sus recursos.
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    description: text('description'),
    // Perfil de facturación: aparece en las cotizaciones del proyecto.
    billingLegalName: varchar('billing_legal_name', { length: 255 }),
    billingTaxId: varchar('billing_tax_id', { length: 32 }),
    billingAddress: text('billing_address'),
    billingPhone: varchar('billing_phone', { length: 32 }),
    billingEmail: varchar('billing_email', { length: 255 }),
    // Ajustes de cotización. Los defaults reproducen el comportamiento previo
    // (IVA 12 % de Guatemala, moneda GTQ, folios COT-000001, 30 días de vigencia).
    // Todo es editable por proyecto con PATCH /projects/:id.
    quoteTaxPercent: numeric('quote_tax_percent', {
      precision: 5,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(12),
    quoteFolioPrefix: varchar('quote_folio_prefix', { length: 16 })
      .notNull()
      .default('COT'),
    quoteValidityDays: integer('quote_validity_days').notNull().default(30),
    quoteDefaultTerms: text('quote_default_terms'),
    currency: varchar('currency', { length: 3 }).notNull().default('GTQ'),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('projects_slug_idx').on(table.slug),
    check(
      'projects_quote_tax_percent_range',
      sql`${table.quoteTaxPercent} >= 0 AND ${table.quoteTaxPercent} <= 100`,
    ),
    check(
      'projects_quote_validity_days_range',
      sql`${table.quoteValidityDays} >= 1 AND ${table.quoteValidityDays} <= 3650`,
    ),
  ],
);

// Relación usuario<->proyecto con su rol dentro del tenant.
export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 32 }).notNull().default('MEMBER'),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('memberships_user_id_project_id_unique').on(
      table.userId,
      table.projectId,
    ),
    index('memberships_user_id_idx').on(table.userId),
    index('memberships_project_id_idx').on(table.projectId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [memberships.projectId],
    references: [projects.id],
  }),
}));

export const projectsRelations = relations(projects, ({ many }) => ({
  leads: many(leads),
}));

// Solicitudes de acceso de un no-miembro a un proyecto. Entidad con ámbito de
// tenant: se consulta siempre por project_id, nunca solo por id. Un único
// PENDING por (project_id, email) lo garantiza el índice único parcial.
export const accessRequestStatusEnum = pgEnum('access_request_status', [
  'PENDING',
  'APPROVED',
  'REJECTED',
]);

export const accessRequests = pgTable(
  'access_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    status: accessRequestStatusEnum('status').notNull().default('PENDING'),
    // Cuándo y por quién se resolvió la solicitud (aprobada o rechazada).
    atendidoEn: timestamp('atendido_en', { withTimezone: true, mode: 'date' }),
    atendidoPorUserId: uuid('atendido_por_user_id').references(() => users.id),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Solo un PENDING por email en cada tenant; una solicitud resuelta puede
    // volver a intentarse (REJECTED → nuevo PENDING).
    uniqueIndex('access_requests_project_email_pending_unique')
      .on(table.projectId, table.email)
      .where(sql`status = 'PENDING'`),
    index('access_requests_project_id_created_at_idx').on(
      table.projectId,
      table.createdAt,
    ),
  ],
);

export const accessRequestsRelations = relations(accessRequests, ({ one }) => ({
  project: one(projects, {
    fields: [accessRequests.projectId],
    references: [projects.id],
  }),
  atendidoPor: one(users, {
    fields: [accessRequests.atendidoPorUserId],
    references: [users.id],
  }),
}));

/* ------------------------------------------------------------------ */
/* CRM: leads, quotes y mensajes                                       */
/* ------------------------------------------------------------------ */

// Etapas del embudo comercial. Se declara como enum de Postgres (y no como
// varchar) para que la base imponga los valores: un stage inválido no llega
// ni a insertarse, ni aunque alguien escriba por SQL.
export const leadStageEnum = pgEnum('lead_stage', [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
]);

export const leadSourceEnum = pgEnum('lead_source', [
  'REFERRAL',
  'WEBSITE',
  'WHATSAPP',
  'SOCIAL_MEDIA',
  'EVENT',
  'COLD_OUTREACH',
  'OTHER',
]);

export const quoteStatusEnum = pgEnum('quote_status', [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'SENT',
  'ACCEPTED',
  'PAID',
  'REJECTED',
]);

export const messageDirectionEnum = pgEnum('message_direction', [
  'INBOUND',
  'OUTBOUND',
]);

/* ------------------------------------------------------------------ */
/* Catálogo de productos y servicios                                   */
/* ------------------------------------------------------------------ */

// Catálogo oficial de precios del proyecto. Se desactiva (active = false), nunca
// se borra: las partidas de cotización que lo citan deben sobrevivir.
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    description: text('description'),
    category: varchar('category', { length: 100 }),
    // Unidad de venta legible ("usuario", "sesión de 4 horas").
    unit: varchar('unit', { length: 50 }),
    // Precio unitario ANTES de IVA, decimal exacto.
    price: numeric('price', { precision: 14, scale: 2, mode: 'number' })
      .notNull()
      .default(0),
    // Descuento máximo permitido al cotizar este producto (0–100).
    maxDiscountPercent: numeric('max_discount_percent', {
      precision: 5,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // El nombre es único dentro del catálogo del tenant, sin distinguir
    // mayúsculas: «Licencia Pro» y «licencia pro» son el mismo producto (P2).
    uniqueIndex('products_project_id_name_unique').on(
      table.projectId,
      sql`lower(${table.name})`,
    ),
    index('products_project_id_active_idx').on(table.projectId, table.active),
    // Habilita FKs compuestas (product_id, project_id) desde las partidas de
    // cotización: un producto citado debe pertenecer al mismo proyecto.
    unique('products_id_project_id_unique').on(table.id, table.projectId),
    check('products_price_non_negative', sql`${table.price} >= 0`),
    check(
      'products_max_discount_range',
      sql`${table.maxDiscountPercent} >= 0 AND ${table.maxDiscountPercent} <= 100`,
    ),
  ],
);

// Cliente (cuenta) del proyecto. Se consulta siempre por project_id.
export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // Nombre del contacto principal (o de la persona, si no hay empresa).
    name: varchar('name', { length: 255 }).notNull(),
    // Cargo del contacto ("Gerente de Proyectos"); sale en el PDF (N9).
    contactPosition: varchar('contact_position', { length: 100 }),
    company: varchar('company', { length: 255 }),
    // NIT u otro identificador fiscal.
    taxId: varchar('tax_id', { length: 32 }),
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 32 }),
    notes: text('notes'),
    // Responsable comercial. El use-case valida que sea miembro del proyecto;
    // si el usuario se borra, el cliente queda sin responsable.
    assignedUserId: uuid('assigned_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    // Lead del que nació el cliente (conversión). Informativo: si el lead se
    // borra, el cliente se conserva. El use-case valida que sea del proyecto.
    sourceLeadId: uuid('source_lead_id'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table): PgTableExtraConfigValue[] => [
    index('clients_project_id_idx').on(table.projectId),
    index('clients_project_id_assigned_user_idx').on(
      table.projectId,
      table.assignedUserId,
    ),
    // Un NIT identifica a un solo cliente dentro del tenant.
    uniqueIndex('clients_project_id_tax_id_unique')
      .on(table.projectId, table.taxId)
      .where(sql`tax_id IS NOT NULL`),
    // Habilita FKs compuestas (client_id, project_id) desde leads y quotes.
    unique('clients_id_project_id_unique').on(table.id, table.projectId),
    // FK compuesta: el lead de origen debe ser del MISMO proyecto. NO ACTION:
    // un lead convertido es historial y no se borra.
    foreignKey({
      columns: [table.sourceLeadId, table.projectId],
      foreignColumns: [leads.id, leads.projectId],
      name: 'clients_source_lead_id_project_id_leads_fk',
    }),
  ],
);

// Lead (cliente potencial) con ámbito de tenant: se consulta siempre por
// project_id, nunca solo por id.
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    // varchar(255) y no text para poder indexar y comparar, igual que
    // users.email dentro de este mismo esquema.
    email: varchar('email', { length: 255 }),
    phone: varchar('phone', { length: 32 }),
    stage: leadStageEnum('stage').notNull().default('NEW'),
    score: integer('score').notNull().default(0),
    company: varchar('company', { length: 255 }),
    // Cargo del contacto dentro de su empresa (N9).
    contactPosition: varchar('contact_position', { length: 100 }),
    // Quién lo registró: MANUAL (una persona del CRM) o AI (el servicio de IA
    // por la integración con API key). Ver integrations/.
    origin: varchar('origin', { length: 10 }).notNull().default('MANUAL'),
    source: leadSourceEnum('source'),
    estimatedValue: numeric('estimated_value', {
      precision: 14,
      scale: 2,
      mode: 'number',
    }),
    notes: text('notes'),
    // Responsable. El use-case valida que sea miembro del proyecto.
    assignedUserId: uuid('assigned_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    // Cliente y producto de interés: sin .references() simple, las FKs
    // compuestas de abajo los atan al MISMO proyecto que el lead.
    clientId: uuid('client_id'),
    interestProductId: uuid('interest_product_id'),
    lastContactAt: timestamp('last_contact_at', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('leads_project_id_idx').on(table.projectId),
    index('leads_project_id_stage_idx').on(table.projectId, table.stage),
    index('leads_project_id_email_idx').on(table.projectId, table.email),
    index('leads_created_at_idx').on(table.createdAt),
    // Job de «lead sin actividad»: leads abiertos por su último contacto.
    index('leads_open_last_activity_idx')
      .on(sql`coalesce(${table.lastContactAt}, ${table.createdAt})`)
      .where(sql`${table.stage} NOT IN ('WON', 'LOST')`),
    // Unicidad COMPUESTA (constraint, no índice suelto) que habilita las FK
    // compuestas de quotes y messages: garantiza en la base que un lead citado
    // por una cotización o un mensaje pertenece al MISMO proyecto que esa fila.
    // Postgres exige que la constraint exista antes de añadir la FK, y
    // `unique()` la emite dentro del CREATE TABLE, que es justo lo que necesita.
    unique('leads_id_project_id_unique').on(table.id, table.projectId),
    index('leads_project_id_assigned_user_idx').on(
      table.projectId,
      table.assignedUserId,
    ),
    index('leads_project_id_client_id_idx').on(table.projectId, table.clientId),
    // Un cliente con leads no se puede borrar (NO ACTION): hay que desactivarlo.
    foreignKey({
      columns: [table.clientId, table.projectId],
      foreignColumns: [clients.id, clients.projectId],
      name: 'leads_client_id_project_id_clients_fk',
    }),
    foreignKey({
      columns: [table.interestProductId, table.projectId],
      foreignColumns: [products.id, products.projectId],
      name: 'leads_interest_product_id_project_id_products_fk',
    }),
    check(
      'leads_estimated_value_non_negative',
      sql`${table.estimatedValue} IS NULL OR ${table.estimatedValue} >= 0`,
    ),
    check('leads_origin_valid', sql`${table.origin} IN ('MANUAL', 'AI')`),
  ],
);

// Cotización de un lead. El dinero usa numeric(14,2) en Postgres, que es
// decimal exacto: no debe calcularse nunca en coma flotante JavaScript.
// Se lee con mode:'number' solo para la respuesta JSON; la suma de total
// debe delegarse en SQL (subtotal + tax) para no perder precisión.
export const quotes = pgTable(
  'quotes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // Sin .references() simple: la integridad de tenant la impone la FK
    // compuesta de abajo, que ata (lead_id, project_id) a (leads.id,
    // leads.project_id). Así es imposible colgar una cotización de un lead de
    // otro proyecto, aunque el código de aplicación se equivoque.
    leadId: uuid('lead_id').notNull(),
    // Cliente al que se cotiza (opcional). Misma garantía de tenant que el
    // lead: la FK compuesta (client_id, project_id) vive en la config de abajo.
    clientId: uuid('client_id'),
    folio: varchar('folio', { length: 64 }).notNull(),
    // Importes calculados por el servidor a partir de las partidas:
    // base = subtotal (bruto) - discount - adjustment; total = base + tax.
    subtotal: numeric('subtotal', {
      precision: 14,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    discount: numeric('discount', {
      precision: 14,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    // Ajuste comercial: descuento global de la cotización, antes de IVA.
    adjustment: numeric('adjustment', {
      precision: 14,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    // IVA aplicado al calcular (el PDF muestra «IVA (12 %)»). Es una copia: si
    // el proyecto cambia su IVA, las cotizaciones guardadas no cambian.
    taxPercent: numeric('tax_percent', {
      precision: 5,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(12),
    tax: numeric('tax', { precision: 14, scale: 2, mode: 'number' })
      .notNull()
      .default(0),
    total: numeric('total', { precision: 14, scale: 2, mode: 'number' })
      .notNull()
      .default(0),
    status: quoteStatusEnum('status').notNull().default('DRAFT'),
    validUntil: timestamp('valid_until', { withTimezone: true, mode: 'date' }),
    notes: text('notes'),
    terms: text('terms'),
    // Si el usuario se borra, la cotización se conserva sin autor.
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    rejectedAt: timestamp('rejected_at', { withTimezone: true, mode: 'date' }),
    paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
    // MANUAL o AI (generada por el servicio de IA, N7). La etiqueta «IA» del
    // listado y la tarjeta «Generada por IA» del PDF salen de aquí.
    origin: varchar('origin', { length: 10 }).notNull().default('MANUAL'),
    // Link de pago que creó el servicio de Pagos y referencia del pago
    // confirmado por su webhook. Ver integrations/payments.
    paymentLinkUrl: text('payment_link_url'),
    paymentReference: varchar('payment_reference', { length: 255 }),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // El folio es único dentro del tenant, no globalmente: dos empresas
    // pueden numerar sus cotizaciones igual.
    uniqueIndex('quotes_project_id_folio_unique').on(
      table.projectId,
      table.folio,
    ),
    index('quotes_project_id_idx').on(table.projectId),
    index('quotes_lead_id_idx').on(table.leadId),
    index('quotes_project_id_client_id_idx').on(
      table.projectId,
      table.clientId,
    ),
    // Habilita la FK compuesta (quote_id, project_id) desde quote_items.
    unique('quotes_id_project_id_unique').on(table.id, table.projectId),
    // Un cliente con cotizaciones no se puede borrar (NO ACTION): se desactiva.
    foreignKey({
      columns: [table.clientId, table.projectId],
      foreignColumns: [clients.id, clients.projectId],
      name: 'quotes_client_id_project_id_clients_fk',
    }),
    // FK compuesta: el lead citado debe vivir en el mismo proyecto.
    foreignKey({
      columns: [table.leadId, table.projectId],
      foreignColumns: [leads.id, leads.projectId],
      name: 'quotes_lead_id_project_id_leads_fk',
    }).onDelete('cascade'),
    check('quotes_adjustment_non_negative', sql`${table.adjustment} >= 0`),
    check('quotes_origin_valid', sql`${table.origin} IN ('MANUAL', 'AI')`),
    check(
      'quotes_tax_percent_range',
      sql`${table.taxPercent} >= 0 AND ${table.taxPercent} <= 100`,
    ),
  ],
);

// Contador de folios por proyecto. Se incrementa con un upsert atómico dentro
// de la transacción que crea la cotización: dos peticiones simultáneas nunca
// obtienen el mismo número.
export const quoteFolioCounters = pgTable('quote_folio_counters', {
  projectId: uuid('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  lastNumber: integer('last_number').notNull().default(0),
});

// Partida de una cotización. Todo lo monetario lo calcula el servidor: el
// precio sale del catálogo y line_total ya descuenta el descuento de la línea.
export const quoteItems = pgTable(
  'quote_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    quoteId: uuid('quote_id').notNull(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').notNull(),
    description: text('description').notNull(),
    quantity: numeric('quantity', {
      precision: 14,
      scale: 2,
      mode: 'number',
    }).notNull(),
    unitPrice: numeric('unit_price', {
      precision: 14,
      scale: 2,
      mode: 'number',
    }).notNull(),
    discountPercent: numeric('discount_percent', {
      precision: 5,
      scale: 2,
      mode: 'number',
    })
      .notNull()
      .default(0),
    lineTotal: numeric('line_total', {
      precision: 14,
      scale: 2,
      mode: 'number',
    }).notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    index('quote_items_quote_id_idx').on(table.quoteId),
    foreignKey({
      columns: [table.quoteId, table.projectId],
      foreignColumns: [quotes.id, quotes.projectId],
      name: 'quote_items_quote_id_project_id_quotes_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.productId, table.projectId],
      foreignColumns: [products.id, products.projectId],
      name: 'quote_items_product_id_project_id_products_fk',
    }),
    check('quote_items_quantity_positive', sql`${table.quantity} > 0`),
    check(
      'quote_items_discount_range',
      sql`${table.discountPercent} >= 0 AND ${table.discountPercent} <= 100`,
    ),
  ],
);

// Mensaje de WhatsApp. Solo tiene createdAt a propósito: es un registro
// inmutable de auditoría, no una entidad editable, así que no lleva updatedAt.
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // Misma criterio que quotes: la FK compuesta de abajo ata el lead al mismo
    // proyecto que el mensaje.
    leadId: uuid('lead_id').notNull(),
    // Id que asigna la API de WhatsApp. Es la clave de idempotencia: el
    // webhook puede reenviar el mismo mensaje y no debe duplicarlo.
    whatsappMessageId: varchar('whatsapp_message_id', {
      length: 255,
    }).notNull(),
    direction: messageDirectionEnum('direction').notNull(),
    content: text('content').notNull(),
    // TEXT, TEMPLATE (plantilla aprobada por Meta), IMAGE, DOCUMENT, AUDIO,
    // VIDEO u OTHER (ubicación, contacto, sticker…).
    type: varchar('type', { length: 20 }).notNull().default('TEXT'),
    // Solo TEMPLATE: nombre de la plantilla enviada.
    templateName: varchar('template_name', { length: 512 }),
    // Archivo enviado o recibido con el mensaje (imagen, PDF…). FK compuesta
    // abajo: el adjunto es del MISMO proyecto.
    attachmentId: uuid('attachment_id'),
    status: varchar('status', { length: 32 }).notNull().default('SENT'),
    // Motivo que reporta WhatsApp cuando el estado es FAILED (p. ej. "131047:
    // Re-engagement message" = fuera de la ventana de 24 h).
    errorMessage: varchar('error_message', { length: 500 }),
    // Cuándo un usuario del CRM abrió la conversación. Solo aplica a INBOUND:
    // null = mensaje del cliente aún no leído (alimenta el contador de no
    // leídos de la bandeja de conversaciones).
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    // El contenido no se edita nunca, pero status, read_at y error_message sí
    // cambian: por eso la tabla también lleva actualizado_en.
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('messages_whatsapp_message_id_unique').on(
      table.whatsappMessageId,
    ),
    // Historial de un chat: WHERE project_id AND lead_id ORDER BY creado_en
    // DESC LIMIT n. Este índice compuesto lo resuelve sin ordenar en memoria.
    index('messages_project_id_lead_id_creado_en_idx').on(
      table.projectId,
      table.leadId,
      table.createdAt,
    ),
    index('messages_project_id_idx').on(table.projectId),
    index('messages_lead_id_idx').on(table.leadId),
    index('messages_project_id_direction_idx').on(
      table.projectId,
      table.direction,
    ),
    // NO ACTION a propósito: los mensajes son registro de auditoría y un lead
    // con mensajes no se puede borrar (la base lo impide aunque la aplicación
    // falle o haya una carrera). El proyecto sí los arrastra al borrarse.
    foreignKey({
      columns: [table.leadId, table.projectId],
      foreignColumns: [leads.id, leads.projectId],
      name: 'messages_lead_id_project_id_leads_fk',
    }),
    // NO ACTION: un adjunto citado por un mensaje no se puede borrar.
    foreignKey({
      columns: [table.attachmentId, table.projectId],
      foreignColumns: [attachments.id, attachments.projectId],
      name: 'messages_attachment_id_project_id_attachments_fk',
    }),
    check(
      'messages_type_valid',
      sql`${table.type} IN ('TEXT', 'TEMPLATE', 'IMAGE', 'DOCUMENT', 'AUDIO', 'VIDEO', 'OTHER')`,
    ),
  ],
);

// Seguimiento comercial de un lead (llamar, reunirse, escribir…) con fecha
// límite. Alimenta "Próximo seguimiento" en Leads, la pestaña Seguimiento del
// lead, "Seguimientos pendientes" del Dashboard y el recordatorio automático.
export const followUps = pgTable(
  'follow_ups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // FK compuesta abajo: el lead es del MISMO proyecto. Si el lead se borra
    // (solo posible sin historial comercial), sus seguimientos se van con él.
    leadId: uuid('lead_id').notNull(),
    type: varchar('type', { length: 20 }).notNull().default('TASK'),
    title: varchar('title', { length: 255 }).notNull(),
    notes: text('notes'),
    dueAt: timestamp('due_at', { withTimezone: true, mode: 'date' }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    // Responsable; si deja el proyecto queda sin asignar.
    assignedUserId: uuid('assigned_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    // Resultado al completarlo ("Cliente pide demo el martes").
    outcome: text('outcome'),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // "Pendientes del proyecto ordenados por fecha" y el job de recordatorios.
    index('follow_ups_project_id_status_due_at_idx').on(
      table.projectId,
      table.status,
      table.dueAt,
    ),
    index('follow_ups_project_id_lead_id_idx').on(
      table.projectId,
      table.leadId,
    ),
    foreignKey({
      columns: [table.leadId, table.projectId],
      foreignColumns: [leads.id, leads.projectId],
      name: 'follow_ups_lead_id_project_id_leads_fk',
    }).onDelete('cascade'),
    check(
      'follow_ups_type_valid',
      sql`${table.type} IN ('CALL', 'MEETING', 'EMAIL', 'WHATSAPP', 'TASK')`,
    ),
    check(
      'follow_ups_status_valid',
      sql`${table.status} IN ('PENDING', 'DONE', 'CANCELLED')`,
    ),
  ],
);

// Notificación para UN usuario dentro de un proyecto (campana del frontend).
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 40 }).notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body'),
    // Recurso al que apunta (LEAD, QUOTE, FOLLOW_UP, ACCESS_REQUEST) y su id.
    entityType: varchar('entity_type', { length: 20 }),
    entityId: uuid('entity_id'),
    // Evita duplicados de los avisos automáticos (un recordatorio por
    // seguimiento vencido aunque el job corra muchas veces).
    dedupeKey: varchar('dedupe_key', { length: 120 }),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // La campana: las de un usuario en un proyecto, más recientes primero.
    index('notifications_user_project_creado_en_idx').on(
      table.userId,
      table.projectId,
      table.createdAt,
    ),
    uniqueIndex('notifications_user_dedupe_key_unique')
      .on(table.userId, table.dedupeKey)
      .where(sql`dedupe_key IS NOT NULL`),
  ],
);

// Invitación por correo a un proyecto. El token viaja solo en el enlace del
// correo; en la base se guarda su hash SHA-256 (como una contraseña).
export const projectInvitations = pgTable(
  'project_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    email: varchar('email', { length: 255 }).notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    status: varchar('status', { length: 20 }).notNull().default('PENDING'),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      mode: 'date',
    }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('project_invitations_token_hash_unique').on(table.tokenHash),
    // Una sola invitación pendiente por correo en cada proyecto.
    uniqueIndex('project_invitations_project_email_pending_unique')
      .on(table.projectId, table.email)
      .where(sql`status = 'PENDING'`),
    check(
      'project_invitations_role_valid',
      sql`${table.role} IN ('ADMIN', 'MEMBER', 'VIEWER')`,
    ),
    check(
      'project_invitations_status_valid',
      sql`${table.status} IN ('PENDING', 'ACCEPTED', 'REVOKED')`,
    ),
  ],
);

// Historial de actividad (N4): una fila por evento relevante del CRM (lead
// creado, cambio de etapa, cotización aprobada, mensaje, seguimiento…). Es un
// registro de solo escritura: nunca se edita. Alimenta la pestaña Actividad del
// lead, el historial del cliente y «Última actividad».
export const activityEvents = pgTable(
  'activity_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // Quién lo hizo; null = el sistema (webhook de WhatsApp, IA, Pagos, job).
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    type: varchar('type', { length: 40 }).notNull(),
    // A qué se refiere. Las FKs compuestas de abajo los atan al MISMO proyecto.
    leadId: uuid('lead_id'),
    clientId: uuid('client_id'),
    quoteId: uuid('quote_id'),
    // Texto listo para mostrar ("Cotización COT-000004 aprobada").
    title: varchar('title', { length: 255 }).notNull(),
    // Datos extra según el tipo (p. ej. { from: 'NEW', to: 'CONTACTED' }).
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('activity_events_project_id_creado_en_idx').on(
      table.projectId,
      table.createdAt,
    ),
    index('activity_events_project_id_lead_id_idx').on(
      table.projectId,
      table.leadId,
    ),
    index('activity_events_project_id_client_id_idx').on(
      table.projectId,
      table.clientId,
    ),
    index('activity_events_project_id_quote_id_idx').on(
      table.projectId,
      table.quoteId,
    ),
    // CASCADE: si el lead, cliente o cotización se borra (solo posible sin
    // historial comercial), su actividad se va con él.
    foreignKey({
      columns: [table.leadId, table.projectId],
      foreignColumns: [leads.id, leads.projectId],
      name: 'activity_events_lead_id_project_id_leads_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.clientId, table.projectId],
      foreignColumns: [clients.id, clients.projectId],
      name: 'activity_events_client_id_project_id_clients_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.quoteId, table.projectId],
      foreignColumns: [quotes.id, quotes.projectId],
      name: 'activity_events_quote_id_project_id_quotes_fk',
    }).onDelete('cascade'),
  ],
);

// Archivo adjunto a un lead o a un cliente (subido desde el CRM o recibido por
// WhatsApp). El contenido vive en el almacenamiento de archivos (disco local
// por ahora); aquí solo se guardan los datos para listarlo y descargarlo.
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id'),
    clientId: uuid('client_id'),
    // Ruta dentro del almacenamiento. La genera el servidor (nunca el nombre
    // que manda el cliente) para que no se pueda escribir fuera de la carpeta.
    storageKey: varchar('storage_key', { length: 500 }).notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 150 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    // UPLOAD = subido desde el CRM; WHATSAPP = recibido en un mensaje.
    source: varchar('source', { length: 20 }).notNull().default('UPLOAD'),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('attachments_storage_key_unique').on(table.storageKey),
    index('attachments_project_id_lead_id_idx').on(
      table.projectId,
      table.leadId,
    ),
    index('attachments_project_id_client_id_idx').on(
      table.projectId,
      table.clientId,
    ),
    // Habilita la FK compuesta (attachment_id, project_id) desde messages.
    unique('attachments_id_project_id_unique').on(table.id, table.projectId),
    // NO ACTION: un lead o cliente con archivos es historial y no se borra.
    foreignKey({
      columns: [table.leadId, table.projectId],
      foreignColumns: [leads.id, leads.projectId],
      name: 'attachments_lead_id_project_id_leads_fk',
    }),
    foreignKey({
      columns: [table.clientId, table.projectId],
      foreignColumns: [clients.id, clients.projectId],
      name: 'attachments_client_id_project_id_clients_fk',
    }),
    check(
      'attachments_owner_present',
      sql`${table.leadId} IS NOT NULL OR ${table.clientId} IS NOT NULL`,
    ),
    check('attachments_size_non_negative', sql`${table.sizeBytes} >= 0`),
    check(
      'attachments_source_valid',
      sql`${table.source} IN ('UPLOAD', 'WHATSAPP')`,
    ),
  ],
);

// API key de un proyecto para los servicios externos (equipo de IA). Se
// guarda solo el hash SHA-256; la clave completa se muestra una única vez al
// crearla. La integración actúa con los permisos de quien creó la clave.
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    // Primeros caracteres de la clave ("fc_live_ab12"), para reconocerla.
    prefix: varchar('prefix', { length: 20 }).notNull(),
    keyHash: varchar('key_hash', { length: 64 }).notNull(),
    // Permisos de la clave ("leads:read"…). Las claves anteriores a los scopes
    // quedan con todos, para no romper integraciones que ya funcionan.
    scopes: text('scopes')
      .array()
      .notNull()
      .default(
        sql`ARRAY['catalog:read','leads:read','leads:write','quotes:write']::text[]`,
      ),
    // Si el creador se borra, la clave deja de funcionar (no hay con qué
    // permisos actuar).
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    lastUsedAt: timestamp('last_used_at', {
      withTimezone: true,
      mode: 'date',
    }),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('api_keys_key_hash_unique').on(table.keyHash),
    index('api_keys_project_id_idx').on(table.projectId),
  ],
);

// Eventos recibidos del servicio de Pagos. event_id es la clave de
// idempotencia: si Pagos reenvía el mismo evento, no se procesa dos veces.
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    quoteId: uuid('quote_id').notNull(),
    eventId: varchar('event_id', { length: 255 }).notNull(),
    type: varchar('type', { length: 40 }).notNull(),
    amount: numeric('amount', { precision: 14, scale: 2, mode: 'number' }),
    currency: varchar('currency', { length: 3 }),
    reference: varchar('reference', { length: 255 }),
    // PROCESSED (aplicado) o IGNORED (p. ej. la cotización ya estaba pagada).
    result: varchar('result', { length: 20 }).notNull(),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('payment_events_event_id_unique').on(table.eventId),
    index('payment_events_project_id_quote_id_idx').on(
      table.projectId,
      table.quoteId,
    ),
    foreignKey({
      columns: [table.quoteId, table.projectId],
      foreignColumns: [quotes.id, quotes.projectId],
      name: 'payment_events_quote_id_project_id_quotes_fk',
    }).onDelete('cascade'),
  ],
);

// Credenciales de WhatsApp Cloud API de un proyecto (una cuenta por proyecto).
// El token se guarda CIFRADO (AES-256-GCM con ENCRYPTION_KEY) y nunca se
// devuelve por HTTP. Si un proyecto no tiene fila, se usan las variables
// WHATSAPP_* del entorno (modo de un solo tenant).
export const whatsappAccounts = pgTable(
  'whatsapp_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    phoneNumberId: varchar('phone_number_id', { length: 50 }).notNull(),
    // Id de la cuenta de WhatsApp Business (WABA): lista y crea plantillas.
    businessAccountId: varchar('business_account_id', { length: 50 }),
    tokenEncrypted: text('token_encrypted').notNull(),
    // Últimos 4 caracteres del token, para que la UI reconozca cuál es.
    tokenLast4: varchar('token_last4', { length: 4 }).notNull(),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('whatsapp_accounts_project_id_unique').on(table.projectId),
    // Un número de WhatsApp pertenece a un solo proyecto: evita que dos
    // tenants hablen por el mismo número.
    uniqueIndex('whatsapp_accounts_phone_number_id_unique').on(
      table.phoneNumberId,
    ),
  ],
);

// Respuestas rápidas del chat: atajos de texto reutilizables del proyecto.
export const quickReplies = pgTable(
  'quick_replies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    // Atajo que escribe el asesor ("saludo", sin la barra).
    shortcut: varchar('shortcut', { length: 40 }).notNull(),
    title: varchar('title', { length: 100 }).notNull(),
    content: text('content').notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('quick_replies_project_id_shortcut_unique').on(
      table.projectId,
      table.shortcut,
    ),
    check(
      'quick_replies_content_not_empty',
      sql`length(trim(${table.content})) > 0`,
    ),
  ],
);

// Endpoints a los que Flowcommerce avisa (POST firmado) cuando pasa algo en el
// proyecto: lead creado, mensaje recibido, cotización pagada… El secreto de
// firma se guarda CIFRADO: hay que recuperarlo para firmar cada envío.
export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    url: varchar('url', { length: 2048 }).notNull(),
    description: varchar('description', { length: 200 }),
    // Eventos a los que está suscrito ("lead.created") o "*" para todos.
    events: text('events').array().notNull(),
    secretEncrypted: text('secret_encrypted').notNull(),
    // Para reconocer el secreto en la UI sin mostrarlo ("whsec_ab12").
    secretPrefix: varchar('secret_prefix', { length: 12 }).notNull(),
    active: boolean('active').notNull().default(true),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('webhook_endpoints_project_id_active_idx').on(
      table.projectId,
      table.active,
    ),
    check(
      'webhook_endpoints_events_not_empty',
      sql`cardinality(${table.events}) > 0`,
    ),
  ],
);

// Registro de cada envío (tras agotar los reintentos): sirve para depurar un
// endpoint que no recibe. No guarda el cuerpo completo, solo lo necesario.
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    event: varchar('event', { length: 60 }).notNull(),
    // SUCCESS = el endpoint respondió 2xx; FAILED = agotó los reintentos.
    status: varchar('status', { length: 10 }).notNull(),
    attempts: integer('attempts').notNull(),
    responseStatus: integer('response_status'),
    error: varchar('error', { length: 500 }),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('webhook_deliveries_endpoint_id_created_idx').on(
      table.endpointId,
      table.createdAt,
    ),
    check(
      'webhook_deliveries_status_valid',
      sql`${table.status} IN ('SUCCESS', 'FAILED')`,
    ),
  ],
);

// Vistas guardadas del listado de leads («Guardar vista»): un nombre y los
// filtros aplicados. Son personales: cada usuario ve solo las suyas.
export const leadViews = pgTable(
  'lead_views',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 60 }).notNull(),
    // Mismos nombres que los query params de GET /leads (sin paginación).
    filters: jsonb('filters')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp('creado_en', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('actualizado_en', {
      withTimezone: true,
      mode: 'date',
    })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('lead_views_user_project_name_unique').on(
      table.userId,
      table.projectId,
      table.name,
    ),
  ],
);

export const productsRelations = relations(products, ({ one }) => ({
  project: one(projects, {
    fields: [products.projectId],
    references: [projects.id],
  }),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  project: one(projects, {
    fields: [leads.projectId],
    references: [projects.id],
  }),
  assignedUser: one(users, {
    fields: [leads.assignedUserId],
    references: [users.id],
  }),
  client: one(clients, {
    fields: [leads.clientId],
    references: [clients.id],
  }),
  interestProduct: one(products, {
    fields: [leads.interestProductId],
    references: [products.id],
  }),
  quotes: many(quotes),
  messages: many(messages),
}));

export const clientsRelations = relations(clients, ({ one }) => ({
  project: one(projects, {
    fields: [clients.projectId],
    references: [projects.id],
  }),
  assignedUser: one(users, {
    fields: [clients.assignedUserId],
    references: [users.id],
  }),
  sourceLead: one(leads, {
    fields: [clients.sourceLeadId],
    references: [leads.id],
  }),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  project: one(projects, {
    fields: [quotes.projectId],
    references: [projects.id],
  }),
  lead: one(leads, {
    fields: [quotes.leadId],
    references: [leads.id],
  }),
  client: one(clients, {
    fields: [quotes.clientId],
    references: [clients.id],
  }),
  // Asesor que la creó (N6).
  createdBy: one(users, {
    fields: [quotes.createdByUserId],
    references: [users.id],
  }),
  items: many(quoteItems),
}));

export const quoteItemsRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, {
    fields: [quoteItems.quoteId],
    references: [quotes.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  project: one(projects, {
    fields: [messages.projectId],
    references: [projects.id],
  }),
  lead: one(leads, {
    fields: [messages.leadId],
    references: [leads.id],
  }),
}));

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type ProjectRow = typeof projects.$inferSelect;
export type NewProjectRow = typeof projects.$inferInsert;
export type MembershipRow = typeof memberships.$inferSelect;
export type NewMembershipRow = typeof memberships.$inferInsert;
export type LeadRow = typeof leads.$inferSelect;
export type NewLeadRow = typeof leads.$inferInsert;
export type QuoteRow = typeof quotes.$inferSelect;
export type QuoteItemRow = typeof quoteItems.$inferSelect;
export type NewQuoteItemRow = typeof quoteItems.$inferInsert;
export type NewQuoteRow = typeof quotes.$inferInsert;
export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;
export type ClientRow = typeof clients.$inferSelect;
export type NewClientRow = typeof clients.$inferInsert;
export type ProductRow = typeof products.$inferSelect;
export type NewProductRow = typeof products.$inferInsert;
export type AccessRequestRow = typeof accessRequests.$inferSelect;
export type FollowUpRow = typeof followUps.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type ProjectInvitationRow = typeof projectInvitations.$inferSelect;
export type ActivityEventRow = typeof activityEvents.$inferSelect;
export type AttachmentRow = typeof attachments.$inferSelect;
export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type PaymentEventRow = typeof paymentEvents.$inferSelect;
export type WhatsAppAccountRow = typeof whatsappAccounts.$inferSelect;
export type QuickReplyRow = typeof quickReplies.$inferSelect;
export type LeadViewRow = typeof leadViews.$inferSelect;
export type WebhookEndpointRow = typeof webhookEndpoints.$inferSelect;
export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;
export type NewAccessRequestRow = typeof accessRequests.$inferInsert;
