# Flowcommerce Backend

API REST de Flowcommerce: CRM multi-tenant por proyecto (leads, cotizaciones, mensajería por WhatsApp y dashboard comercial) con autenticación por Supabase Auth y control de acceso por roles.

## Tecnologías

- Node.js 24 LTS + TypeScript
- NestJS 11
- PostgreSQL 17 (Docker en local) + Drizzle ORM
- Supabase (Postgres, Auth y Storage)
- pnpm workspaces
- Jest + Supertest

## Inicio rápido

Requisitos: Node.js 24, pnpm y Docker.

```bash
pnpm install
cp .env.example .env      # ajusta DATABASE_URL (y las claves de Supabase si las usas)
pnpm run docker:up        # levanta PostgreSQL en localhost:5432
pnpm run db:migrate       # aplica las migraciones
pnpm run db:seed          # crea el usuario de desarrollo (idempotente; con claves de Supabase crea también su cuenta)
pnpm run dev              # API en http://localhost:3000
```

- Swagger: `http://localhost:3000/docs`
- Health check: `GET http://localhost:3000/api/v1/health`
- Usuario de seed: `seed@flowcommerce.local` / `SeedPassword123!` (solo puede iniciar sesión si `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` estaban definidas al correr el seed)

> `dev`, `start` y `build` compilan antes el paquete del workspace `@flowcommerce/types` automáticamente.

## Variables de entorno

Todas están documentadas en [.env.example](.env.example).

| Variable | Descripción |
|----------|-------------|
| `DATABASE_URL` | Cadena de conexión a PostgreSQL |
| `POSTGRES_PORT`, `POSTGRES_DB` | Puerto y nombre de la base de datos del contenedor Docker |
| `PORT` | Puerto HTTP de la API (por defecto `3000`) |
| `DIRECT_URL` | Conexión directa a Postgres (Supabase, puerto 5432) para las migraciones. Si se omite se usa `DATABASE_URL` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Proyecto de Supabase. La clave `service_role` solo vive en el servidor. Obligatorias para verificar sesiones, invitar usuarios y usar Storage |
| `SUPABASE_JWT_SECRET` | Solo si el proyecto firma los JWT con el secreto compartido (HS256). Los proyectos con claves asimétricas no la necesitan |
| `SUPABASE_STORAGE_BUCKET` | Bucket privado de Storage (por defecto `uploads`) con `FILE_STORAGE_DRIVER=supabase` |
| `APP_URL` | URL del frontend (CORS y destino del enlace de invitación). **Obligatoria en producción** |
| `RESEND_API_KEY`, `EMAIL_FROM` | Envío de correos por Resend. Si faltan fuera de producción se usa `ConsoleEmailSender`, que imprime los correos en consola. **Obligatorias en producción** |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Credenciales de la WhatsApp Cloud API (Graph). Sin `WHATSAPP_PHONE_NUMBER_ID` el webhook no persiste nada, y un evento solo se acepta si trae ese `phone_number_id` |
| `WHATSAPP_GRAPH_API_VERSION` | Versión de Graph (por defecto `v21.0`) |
| `WHATSAPP_MAX_RETRIES`, `WHATSAPP_RETRY_BASE_MS`, `WHATSAPP_REQUEST_TIMEOUT_MS` | Reintentos y timeout de las llamadas a Graph |
| `WHATSAPP_APP_SECRET` | Secreto para verificar la firma `X-Hub-Signature-256` del webhook |
| `WHATSAPP_VERIFY_TOKEN` | Token de verificación del webhook (handshake `GET`) |
| `WHATSAPP_PROJECT_ID` | Proyecto (tenant) al que pertenece el número de WhatsApp |
| `TRUST_PROXY` | Proxies delante de la API (`1` en la mayoría de hostings). Necesario para que el rate limiting vea la IP real |
| `SWAGGER_ENABLED` | `/docs` está activo fuera de producción; en producción solo con `true` |
| `THROTTLE_ENABLED`, `THROTTLE_<RUTA>_LIMIT`, `THROTTLE_<RUTA>_TTL_MS` | Límite de peticiones por IP en los endpoints públicos (`false` lo desactiva) |
| `SCHEDULER_ENABLED` | Recordatorios automáticos cada 10 minutos (`false` los apaga) |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | Id de la cuenta de WhatsApp Business (WABA). Necesario para listar las plantillas aprobadas |
| `FILE_STORAGE_DRIVER` | Dónde se guardan los archivos. Hoy solo `local` (ver [Almacenamiento de archivos](#almacenamiento-de-archivos)) |
| `UPLOADS_DIR` | Carpeta del driver `local` (por defecto `uploads`, ignorada por git) |
| `PAYMENTS_SERVICE_URL`, `PAYMENTS_SERVICE_TOKEN` | Servicio del equipo de Pagos que crea los links de pago |
| `PAYMENTS_WEBHOOK_SECRET` | Secreto compartido con Pagos para firmar su webhook. Sin él, el webhook responde 403 |

## Scripts

| Comando | Descripción |
|---------|-------------|
| `pnpm run dev` | Iniciar la API en modo watch |
| `pnpm run build` | Compilar a `dist/` |
| `pnpm run start:prod` | Ejecutar la build compilada |
| `pnpm run lint` | ESLint con autocorrección |
| `pnpm run format` | Formatear con Prettier |
| `pnpm run test` | Pruebas unitarias |
| `pnpm run test:cov` | Pruebas unitarias con cobertura |
| `pnpm run test:e2e` | Pruebas E2E (requieren la base de datos levantada y migrada) |
| `pnpm run docker:up` / `docker:down` | Iniciar o detener PostgreSQL |
| `pnpm run db:generate` | Generar una migración a partir de `src/db/schema.ts` |
| `pnpm run db:migrate` | Aplicar las migraciones pendientes |
| `pnpm run db:seed` | Cargar los datos de desarrollo |

## Estructura del proyecto

```
packages/
  types/          # Enums y tipos compartidos (roles, permisos, estados...)
src/
  auth/           # Registro, login, sesión, logout y recuperación de contraseña
  authorization/  # Matriz rol → permiso, guard y decoradores
  projects/       # Proyectos (tenants) y miembros
  access-requests/# Solicitudes de acceso a un proyecto
  leads/          # Leads del CRM
  quotes/         # Cotizaciones
  messages/       # WhatsApp: envío, webhook, bandeja de conversaciones
  follow-ups/     # Seguimientos comerciales de los leads
  notifications/  # Notificaciones (campana) y recordatorios programados
  search/         # Búsqueda global
  invitations/    # Invitaciones por correo
  dashboard/      # Métricas agregadas del proyecto
  activity/       # Historial de actividad (quién hizo qué y cuándo)
  files/          # Archivos: almacenamiento, adjuntos de leads y clientes
  integrations/   # API keys, endpoints para IA y link/webhook de Pagos
  users/          # Perfil, foto de perfil y repositorio de usuarios
  health/         # Health check
  common/         # Excepciones de dominio, filtro global, DTOs y utilidades
  db/             # Esquema de Drizzle, migraciones y seed
test/             # Pruebas E2E
```

Cada módulo de negocio sigue una arquitectura por capas:

- `domain/`: entidades e interfaces de repositorio, sin dependencias de framework.
- `application/`: casos de uso (`*.use-case.ts`) y puertos.
- `infrastructure/`: implementaciones con Drizzle y adaptadores externos (Supabase, Resend, WhatsApp).
- `presentation/`: controllers, DTOs, guards y decoradores.

Las excepciones de dominio (`src/common/exceptions`) se traducen a respuestas HTTP en `GlobalExceptionFilter`. La validación es global y estricta: si el cuerpo trae propiedades no declaradas en el DTO, la API responde 400.

## Autenticación y autorización

- La sesión es el access token de Supabase Auth, que el frontend manda en `Authorization: Bearer <jwt>`. No hay cookie de sesión, así que Frontend y API pueden vivir en dominios distintos; solo hay que declarar el origen del frontend en `CORS_ORIGINS` (o `APP_URL`).
- El login, el registro y la recuperación de contraseña los hace el frontend con `supabase-js`. Ver la sección «Supabase» al final.
- **Solicitud de acceso pública:** responde siempre 202 con el mismo cuerpo exista o no una cuenta con ese correo o una solicitud pendiente, para no revelar qué correos están registrados.
- Las rutas `projects/:projectId/...` pasan por `AuthenticatedGuard` y `ProjectPermissionGuard`. Cada handler declara el permiso que exige con `@RequirePermission(...)`.
- Los recursos de otro proyecto responden **404**, no 403, para no revelar que existen.

Matriz de roles (fuente de verdad: [role-permissions.ts](src/authorization/domain/role-permissions.ts)):

| Permiso | OWNER | ADMIN | MEMBER | VIEWER |
|---------|:-----:|:-----:|:------:|:------:|
| Ver proyecto y miembros | ✓ | ✓ | ✓ | ✓ |
| Editar proyecto | ✓ | ✓ | | |
| Eliminar proyecto | ✓ | | | |
| Invitar, cambiar rol y quitar miembros | ✓ | ✓ | | |
| Ver leads y cotizaciones | ✓ | ✓ | ✓ | ✓ |
| Crear y editar leads | ✓ | ✓ | ✓ | |
| Eliminar leads (sin historial: ver reglas de negocio) | ✓ | ✓ | | |
| Crear, editar, borrar (borradores) y mover cotizaciones por su ciclo | ✓ | ✓ | ✓ | |
| Aprobar cotizaciones y marcarlas pagadas | ✓ | ✓ | | |
| Enviar mensajes por WhatsApp | ✓ | ✓ | ✓ | |

## API

Ruta base: `/api/v1`. La referencia completa con esquemas de request y response está en Swagger (`/docs`).

### Auth e invitaciones (públicas salvo `session` y `invitations/accept`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/auth/session` | Sesión actual (requiere `Authorization: Bearer`) |
| POST | `/auth/access-requests` | Solicitar acceso a un proyecto (siempre 202 con el mismo cuerpo; 404 solo si el proyecto no existe) |
| POST | `/invitations/preview` | Ver una invitación con el token del correo (pública) |
| POST | `/invitations/accept` | Aceptar una invitación (requiere sesión con el mismo correo invitado) |

`access-requests` e invitaciones tienen **límite por IP**: al pasarlo responden 429. El de login, registro y recuperación de contraseña lo aplica Supabase Auth.

### Proyectos y miembros

| Método | Ruta | Permiso |
|--------|------|---------|
| POST | `/projects` | Autenticado |
| GET | `/projects/my` | Autenticado |
| GET | `/projects/:projectId` | `PROJECT_READ` (con perfil de facturación y ajustes de cotización) |
| PATCH | `/projects/:projectId` | `PROJECT_UPDATE` (OWNER y ADMIN; el slug no se edita) |
| GET | `/projects/:projectId/members` | `MEMBER_READ` |
| POST | `/projects/:projectId/members` | `MEMBER_INVITE` |
| PATCH | `/projects/:projectId/members/:membershipId` | `MEMBER_UPDATE_ROLE` |
| DELETE | `/projects/:projectId/members/:membershipId` | `MEMBER_REMOVE` |
| GET | `/projects/:projectId/access-requests` | `MEMBER_INVITE` |
| POST | `/projects/:projectId/access-requests/:requestId/approve` | `MEMBER_INVITE` |
| POST | `/projects/:projectId/access-requests/:requestId/reject` | `MEMBER_INVITE` |
| POST / GET | `/projects/:projectId/invitations` | `MEMBER_INVITE` / `MEMBER_READ` (invitar por correo / pendientes) |
| DELETE | `/projects/:projectId/invitations/:invitationId` | `MEMBER_INVITE` (revocar) |

### Usuario

| Método | Ruta | Permiso |
|--------|------|---------|
| GET | `/users/me` | Autenticado |
| PATCH | `/users/me` | Autenticado (`name`, `phone` y `position` del propio usuario) |
| PUT / DELETE | `/users/me/avatar` | Autenticado (foto de perfil: JPG, PNG o WebP de hasta 2 MB, `multipart/form-data` con `file`) |
| GET | `/users/:userId/avatar` | Uno mismo o un compañero de algún proyecto (si no, 404) |

### Catálogo y clientes

| Método | Ruta | Permiso |
|--------|------|---------|
| POST / GET | `/projects/:projectId/products` | `PRODUCT_MANAGE` / `PRODUCT_READ` |
| GET / PATCH | `/projects/:projectId/products/:productId` | `PRODUCT_READ` / `PRODUCT_MANAGE` (no se borran: `active=false`) |
| POST / GET | `/projects/:projectId/clients` | `CLIENT_CREATE` / `CLIENT_READ` |
| GET / PATCH / DELETE | `/projects/:projectId/clients/:clientId` | `CLIENT_READ` / `CLIENT_UPDATE` / `CLIENT_DELETE` |
| GET | `/projects/:projectId/clients/:clientId/stats` | `CLIENT_READ` |
| POST | `/projects/:projectId/leads/:leadId/convert` | `CLIENT_CREATE` + `LEAD_UPDATE` (lead → cliente, en una sola transacción) |

### CRM

| Método | Ruta | Permiso |
|--------|------|---------|
| POST | `/projects/:projectId/leads` | `LEAD_CREATE` |
| GET | `/projects/:projectId/leads` | `LEAD_READ` |
| GET | `/projects/:projectId/leads/:leadId` | `LEAD_READ` |
| PATCH | `/projects/:projectId/leads/:leadId` | `LEAD_UPDATE` |
| DELETE | `/projects/:projectId/leads/:leadId` | `LEAD_DELETE` |
| POST | `/projects/:projectId/quotes` | `QUOTE_CREATE` |
| GET | `/projects/:projectId/quotes` | `QUOTE_READ` |
| GET | `/projects/:projectId/quotes/:quoteId` | `QUOTE_READ` |
| PATCH | `/projects/:projectId/quotes/:quoteId` | `QUOTE_CREATE` (solo en `DRAFT`) |
| DELETE | `/projects/:projectId/quotes/:quoteId` | `QUOTE_CREATE` (solo en `DRAFT`) |
| PATCH | `/projects/:projectId/quotes/:quoteId/status` | `QUOTE_CREATE` (+ `QUOTE_APPROVE` para aprobar o marcar como pagada) |
| GET | `/projects/:projectId/quotes/:quoteId/pdf` | `QUOTE_READ` (`?download=true` para descargar) |
| POST | `/projects/:projectId/quotes/:quoteId/send` | `QUOTE_CREATE` (correo con el PDF; `APPROVED` → `SENT`) |
| POST | `/projects/:projectId/leads/:leadId/follow-ups` | `LEAD_UPDATE` |
| GET | `/projects/:projectId/follow-ups` | `LEAD_READ` (filtros `leadId`, `status`, `assignedUserId`, `dueFrom`, `dueTo`, `overdue`) |
| GET / PATCH / DELETE | `/projects/:projectId/follow-ups/:followUpId` | `LEAD_READ` / `LEAD_UPDATE` / `LEAD_UPDATE` |
| POST | `/projects/:projectId/leads/:leadId/messages` | `WHATSAPP_SEND_MESSAGE` |
| GET | `/projects/:projectId/leads/:leadId/messages` | `LEAD_READ` |
| POST | `/projects/:projectId/leads/:leadId/messages/read` | `WHATSAPP_SEND_MESSAGE` |
| GET | `/projects/:projectId/conversations` | `LEAD_READ` |
| GET | `/projects/:projectId/conversations/unread-count` | `LEAD_READ` |
| POST | `/projects/:projectId/leads/:leadId/messages/template` | `WHATSAPP_SEND_MESSAGE` (plantilla aprobada; funciona fuera de la ventana de 24 h) |
| POST | `/projects/:projectId/leads/:leadId/messages/media` | `WHATSAPP_SEND_MESSAGE` (enviar un adjunto ya subido por WhatsApp) |
| GET | `/projects/:projectId/whatsapp/templates` | `WHATSAPP_SEND_MESSAGE` (plantillas aprobadas de la cuenta) |
| POST / GET | `/projects/:projectId/attachments` | `LEAD_UPDATE`/`CLIENT_UPDATE` para subir · `LEAD_READ`/`CLIENT_READ` para listar (filtros `leadId`, `clientId`) |
| GET | `/projects/:projectId/attachments/:attachmentId/download` | `LEAD_READ`/`CLIENT_READ` (`?inline=true` para vista previa) |
| DELETE | `/projects/:projectId/attachments/:attachmentId` | `LEAD_UPDATE`/`CLIENT_UPDATE` (409 si pertenece a un mensaje de WhatsApp) |
| GET | `/projects/:projectId/activity` | `LEAD_READ` (filtros `leadId`, `clientId`, `quoteId`, `types`) |
| POST | `/projects/:projectId/quotes/:quoteId/payment-link` | `QUOTE_CREATE` (solo `ACCEPTED`; lo crea el servicio de Pagos) |
| POST / GET | `/projects/:projectId/api-keys` | `PROJECT_UPDATE` (la clave completa se muestra solo al crearla) |
| DELETE | `/projects/:projectId/api-keys/:keyId` | `PROJECT_UPDATE` (revocar) |
| GET | `/projects/:projectId/dashboard` | `PROJECT_READ` |
| GET | `/projects/:projectId/notifications` | `PROJECT_READ` (solo las del usuario de la sesión) |
| GET | `/projects/:projectId/notifications/unread-count` | `PROJECT_READ` |
| POST | `/projects/:projectId/notifications/:notificationId/read` | `PROJECT_READ` |
| POST | `/projects/:projectId/notifications/read-all` | `PROJECT_READ` |
| GET | `/projects/:projectId/search?q=` | `PROJECT_READ` (cada sección según su permiso de lectura) |

### Otros

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET / POST | `/webhooks/whatsapp` | Webhook de Meta (no aparece en Swagger) |
| GET | `/integrations/ai/catalog` | IA: productos activos (API key) |
| GET | `/integrations/ai/leads/:leadId/context` | IA: lead, últimos mensajes y cotizaciones (API key) |
| POST | `/integrations/ai/leads` | IA: crear un lead con `origin = AI` (API key) |
| POST | `/integrations/ai/quotes` | IA: cotización sugerida en `DRAFT` con `origin = AI` (API key) |
| POST | `/integrations/payments/webhook` | Pagos: confirmación de pago firmada con HMAC (no aparece en Swagger) |

Las rutas `/integrations/ai/*` no usan cookie: se autentican con `Authorization: Bearer fc_live_...` (o `X-Api-Key`). El proyecto sale de la clave, nunca de la ruta ni del body.

## Almacenamiento de archivos

La foto de perfil y los adjuntos (subidos al CRM o recibidos por WhatsApp) pasan por el puerto `FileStorage` (`src/files/domain/file-storage.ts`). Los casos de uso no saben dónde se guarda el archivo; la elección es **explícita** en `FILE_STORAGE_DRIVER`, y un valor desconocido detiene el arranque con un mensaje claro.

| Opción | Estado | Ventajas | Desventajas |
|--------|--------|----------|-------------|
| `local` (carpeta `UPLOADS_DIR`) | ✅ Implementado, por defecto | Sin cuentas ni llaves; ideal para la demo y un solo servidor | Se pierde si el hosting no tiene disco persistente (Render free, contenedores); no sirve con varias instancias |
| S3 / Cloudflare R2 / MinIO | Pendiente de decidir | Estándar de la industria; R2 tiene plan gratis; escala | Hay que crear el bucket y coordinar las llaves con CI/CD |
| Cloudinary | Pendiente de decidir | Plan gratis, optimiza imágenes | Pensado para imágenes; PDF y audio son menos naturales; otra cuenta más |

Para agregar una opción: crear la clase (p. ej. `S3FileStorage implements FileStorage`), sumarla a `FILE_STORAGE_DRIVERS` y al `switch` de `create-file-storage.ts`. Nada más cambia. Las claves de archivo las genera siempre el servidor (`projects/<projectId>/attachments/<uuid>.pdf`); el nombre que manda el navegador solo se muestra.

## Contratos con IA y Pagos

**IA.** Un OWNER o ADMIN crea una API key en `POST /projects/:projectId/api-keys` y se la entrega al equipo de IA por un canal seguro. Solo se guarda su hash (SHA-256). La integración actúa con los permisos de quien creó la clave y solo dentro de su proyecto; revocarla corta el acceso al instante. Endpoints en la tabla de arriba: la IA lee catálogo y contexto, y crea leads y cotizaciones en `DRAFT` marcados `origin = AI`, que una persona revisa y manda a aprobación.

**Pagos.**

1. El CRM pide el link: `POST {PAYMENTS_SERVICE_URL}/payment-links` con `Authorization: Bearer {PAYMENTS_SERVICE_TOKEN}` e `Idempotency-Key: <quoteId>`. Cuerpo: `projectId`, `quoteId`, `folio`, `amount`, `currency`, `description`, `customer`. Respuesta: `{ "url": "https://...", "id": "plink_..." }`.
2. Pagos confirma con `POST /api/v1/integrations/payments/webhook` y la cabecera `X-FlowCommerce-Signature: t=<unix>,v1=<hex>`, donde `v1 = HMAC-SHA256(PAYMENTS_WEBHOOK_SECRET, "<t>.<cuerpo crudo>")`. Las firmas de más de 5 minutos se rechazan.
3. Cuerpo del evento: `eventId` (único; un repetido responde `DUPLICATE`), `type` (`payment.succeeded`, `payment.failed`, `payment_link.created`), `projectId`, `quoteId`, `amount`, `currency`, `reference` y `paymentLinkUrl`.
4. `payment.succeeded` pasa la cotización `ACCEPTED` → `PAID` solo si el importe coincide con el total (409 si no). `payment.failed` se registra sin cambiar nada.

## Reglas de negocio

**Etapas de un lead:** `NEW` (Nuevo) → `CONTACTED` (Contactado) → `QUALIFIED` (Seguimiento) → `PROPOSAL` (Cotización) → `NEGOTIATION` (Negociación) → `WON` (Ganado) / `LOST` (Perdido).

**Borrado de leads.** `DELETE /leads/:id` es atómico y se niega con 409 si el lead tiene cotizaciones fuera de `DRAFT` (en revisión, enviadas, aceptadas, pagadas o rechazadas) cualquier mensaje o un cliente originado por su conversión: son historial comercial y de auditoría. La base lo refuerza con FK `NO ACTION` en `messages` y `clients.source_lead_id`, así que ni siquiera un `DELETE` directo o una carrera lo puede saltar. Para retirarlo del embudo se pasa a `LOST`. Los borradores sí se borran con el lead.

**Estados de una cotización.** Solo se permiten estas transiciones (cualquier otra responde 409):

```
DRAFT ──► PENDING_APPROVAL ──► APPROVED ──► SENT ──► ACCEPTED ──► PAID
              │                              │
              └──► DRAFT (devolver)          └──► REJECTED (terminal)
```

- Pasar a `APPROVED` o a `PAID` exige `QUOTE_APPROVE`; el resto del ciclo, `QUOTE_CREATE`. Un MEMBER puede pedir la aprobación, enviar y registrar la respuesta del cliente, pero no aprobar ni cobrar.
- Cada transición rellena su fecha (`approvedAt`, `sentAt`, `acceptedAt`, `rejectedAt`, `paidAt`).
- Al pasar a `ACCEPTED` el lead de la cotización pasa a `WON` en la misma transacción, así el KPI `ganado` y la conversión del Dashboard no dependen de moverlo a mano.
- La transición es **atómica** (`UPDATE … WHERE status = <esperado>`): si dos peticiones compiten, solo una gana y la otra recibe 409.
- Una cotización sin partidas no puede pedir aprobación.
- Solo los borradores (`DRAFT`) se editan o se borran; en cualquier otro estado, 409.
- **Vigencia:** `validUntil` no puede estar en el pasado al crear o editar (400; `null` = sin vencimiento). Una cotización vencida no se puede aceptar (409). Las `SENT` que vencen generan un aviso automático (no cambian de estado).
- **Pedir aprobación revalida el catálogo:** si un producto se desactivó, bajó su descuento máximo o cambió de precio desde que se guardaron las partidas, responde 409 y hay que volver a guardarlas.
- No se cotiza para un cliente desactivado (409).

**Partidas e importes.** El body solo lleva `productId`, `quantity` y, opcionalmente, `discountPercent` y `description`; el precio sale del catálogo y el servidor calcula todo (en céntimos enteros, sin coma flotante):

- línea: `quantity × unitPrice − descuento` (`lineTotal`).
- `subtotal` = suma bruta de las partidas, `discount` = suma de descuentos por línea.
- `adjustment` (opcional, por defecto 0) = **ajuste comercial**: descuento global en dinero sobre toda la cotización. Se resta **antes** del IVA y no puede superar `subtotal − discount` (400).
- `tax` = IVA sobre `subtotal − discount − adjustment`, `total` = `subtotal − discount − adjustment + tax`.
- `taxPercent` guarda el IVA con el que se calculó la cotización (para el PDF), aunque después cambien los ajustes del proyecto.
- `PATCH` solo con `adjustment` recalcula los importes sin tocar las partidas.
- Un descuento superior a `products.max_discount_percent` responde 400; un producto inactivo, 409; un producto, lead o cliente de otro proyecto, 404.
- `PATCH` con `items` reemplaza todas las partidas y recalcula.

**Folio.** Automático y correlativo por proyecto (`COT-000001`, `COT-000002`…; el prefijo es un ajuste del proyecto), generado con un contador atómico dentro de la misma transacción que crea la cotización; único por `(project_id, folio)`. Si choca con un folio ya existente (cotizaciones antiguas), el contador se re-sincroniza y se reintenta: nunca responde 500.

**PDF y envío.** `GET /quotes/:id/pdf` genera el PDF (pdfkit) con el perfil de facturación, cliente, asesor, partidas, totales y condiciones. `POST /quotes/:id/send` lo envía por correo como adjunto (Resend; en desarrollo sin credenciales se imprime en consola): primero el correo y después `APPROVED → SENT`, así que si el correo falla la cotización sigue aprobada.

**Listado de cotizaciones.** `GET /quotes` devuelve el resumen `{id, name}` del lead y del cliente y admite `search` (folio), `status`, `clientId`, `leadId`, `createdFrom`/`createdTo`, `sortBy` (`createdAt`, `total`, `folio`), `order` (`asc`/`desc`), `page` y `limit`.

**Estadísticas de cliente.** `GET /clients/:clientId/stats` devuelve `quotesCount`, `paidQuotesCount` y `salesTotal` (suma de las cotizaciones `PAID`). El listado `GET /clients` trae los mismos tres campos en cada fila (una sola consulta por página).

**Clientes y catálogo.** El NIT se guarda normalizado (`7745213-8` → `77452138`), así los duplicados se detectan. Los nombres con solo espacios responden 400. El nombre de producto es único sin distinguir mayúsculas. Un lead no puede apuntar a un cliente ni a un producto desactivado (409).

**Miembros.** Un proyecto nunca se queda sin OWNER: la comprobación y el cambio van en la misma transacción con bloqueo de filas, así que ni dos peticiones simultáneas lo logran (403). Quien sale del proyecto deja de ser responsable de sus leads y clientes **de ese proyecto**.

**Invitaciones.** El OWNER/ADMIN invita con correo y rol (jerarquía de roles; OWNER no se invita). Llega un enlace `APP_URL/invitations/accept?token=…` que vence en 7 días; en la base solo se guarda el hash del token. Se acepta con sesión del mismo correo (quien no tiene cuenta se registra primero). Reinvitar reemplaza el enlace anterior.

**Seguimientos.** Cada lead puede tener seguimientos (`CALL`, `MEETING`, `EMAIL`, `WHATSAPP`, `TASK`) con fecha límite y responsable (por defecto quien lo crea). Solo los `PENDING` se editan; `DONE` (con `outcome`) y `CANCELLED` son finales. Completar uno actualiza `lastContactAt` del lead. Los leads traen `nextFollowUpAt` y el Dashboard `summary.seguimientosPendientes` / `seguimientosVencidos`.

**Notificaciones.** Se generan solas: cotización pendiente de aprobación (a OWNER/ADMIN), aprobada, devuelta, aceptada, rechazada o pagada (a quien la creó), mensaje de WhatsApp nuevo (al responsable del lead), lead asignado, solicitud de acceso, seguimiento vencido y cotización enviada que venció (recordatorios del scheduler cada 10 min, sin duplicados). Quien provoca el evento no se notifica a sí mismo, y una notificación fallida nunca rompe la operación principal.

**Ajustes del proyecto** (`PATCH /projects/:projectId`, solo OWNER y ADMIN):

- `billing`: perfil de facturación (`legalName`, `taxId`, `address`, `phone`, `email`). Cambios parciales: lo que no se envía no se toca y `null` borra el dato.
- `quoteSettings`: `taxPercent` (IVA, 0–100; por defecto 12, el IVA de Guatemala), `folioPrefix` (A–Z, 0–9 y guion; por defecto `COT`), `validityDays` (1–3650; por defecto 30), `defaultTerms` y `currency` (ISO 4217; por defecto `GTQ`). Todo es editable por proyecto; los proyectos creados antes del cambio de defaults conservan sus valores.
- Al crear una cotización: el IVA sale de `taxPercent`; el folio usa `folioPrefix`; si el body no trae `validUntil` se usa hoy + `validityDays` (un `null` explícito significa sin vencimiento); si no trae `terms` se usa `defaultTerms`. Cambiar los ajustes no reescribe las cotizaciones ya guardadas.

**Dashboard.** Vista agregada calculada con `GROUP BY` sobre `leads` y `quotes`, siempre filtrada por `projectId`; no hay tabla de métricas ni entidad de ventas (detalle en [dashboard.types.ts](src/dashboard/domain/dashboard.types.ts)).

- `summary.leadsActivos`: leads en `NEW` + `CONTACTED` + `QUALIFIED` + `PROPOSAL` + `NEGOTIATION` (todo menos `WON` y `LOST`).
- `summary.cotizacionesEnRevision`: cotizaciones en `PENDING_APPROVAL`.
- `summary.ganado`: cantidad de leads en `WON` (no es un monto).
- `summary.pipeline`: suma de `estimatedValue` de los leads activos (todo menos `WON` y `LOST`), antes de IVA; los leads sin valor suman 0.
- `leads.porEstado` y `quotes.porEstado` devuelven siempre todas las claves (7 etapas y 7 estados de cotización), con 0 si no hay registros.
- `sales.porEstado`: monto (`quotes.total`) por estado de cotización. `sales.porPeriodo`: **ventas** = cotizaciones `PAID` agrupadas por mes de pago (`paidAt`, `YYYY-MM`, UTC); cuadra con las ventas de `GET /clients/:id/stats`.
- `conversion.porPeriodo`: por mes de creación del lead, `ganados / creados` (0 si no hay creados).
- Un `projectId` que no es UUID responde 400; un proyecto ajeno o inexistente, 403.
- **Filtro por período** (opcional): `?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z`, intervalo `[from, to)`, máximo 366 días, los dos juntos (si no, 400). Sin ellos el Dashboard es histórico, como antes.
  - Se filtran `quotes`, `sales` y `conversion`. `summary` y `leads.porEstado` son siempre la **foto actual** (un lead activo o el pipeline no tienen fecha).
  - `periodo` (null sin rango) trae los totales del rango (`ventas`, `cotizacionesPagadas`, `cotizacionesEnviadas`, `leadsCreados`, `leadsGanados`, `conversion`), los del período anterior de la misma duración y la `variacion` en % (null si el anterior era 0).

**Recuperación de contraseña.** La gestiona Supabase Auth (enlace por correo, caducidad y límites de envío se configuran en su panel). Esta API no emite ni valida esos tokens.

**WhatsApp.**

- La API necesita `rawBody` para verificar `X-Hub-Signature-256` sobre el cuerpo original de la petición.
- El tenant de los mensajes entrantes y salientes es siempre `WHATSAPP_PROJECT_ID`; nunca se toma de un parámetro de la petición.
- Si el lead pertenece a otro proyecto, la API responde 404 sin llegar a llamar a Graph.
- Un mensaje entrante de un número desconocido **crea el lead** (origen `WHATSAPP`, etapa `NEW`, nombre del perfil de WhatsApp). Es atómico: dos mensajes simultáneos del mismo número no crean dos leads.
- Enviar o recibir un mensaje actualiza `lastContactAt` del lead.
- Si WhatsApp no entrega un mensaje, queda `FAILED` con `errorMessage` (p. ej. `131047: Re-engagement message`).
- **Ventana de 24 h**: WhatsApp solo deja enviar texto libre en las 24 h siguientes al último mensaje del cliente. La API no bloquea el envío, pero devuelve `windowOpenUntil` en la bandeja y en el historial para que el frontend avise. Fuera de la ventana se usa una **plantilla aprobada** por Meta: `GET /whatsapp/templates` las lista (requiere `WHATSAPP_BUSINESS_ACCOUNT_ID`) y `POST .../messages/template` envía una con sus parámetros `{{1}}`, `{{2}}`…; en el historial queda el texto ya armado.
- **Bandeja** (`GET /conversations`): un elemento por lead con mensajes, con `lastMessage`, `unreadCount` y `windowOpenUntil`; filtros `search` (nombre, teléfono, empresa) y `unread=true`; paginada.
- **Archivos por WhatsApp**: lo que el cliente manda (imagen, PDF, audio…) se descarga de Meta y queda como adjunto del lead; `POST .../messages/media` reenvía un adjunto subido al CRM.
- **Historial de actividad** (`GET /activity`): crear y mover leads, cotizaciones, mensajes, archivos y pagos dejan una línea con quién, qué y cuándo. Escribirla nunca hace fallar la operación principal.
- **Historial** (`GET /leads/:leadId/messages`): paginación por cursor (`?before=<nextCursor>&limit=50`) para el scroll hacia arriba del chat. Leer no marca nada; `POST .../messages/read` marca como leídos los mensajes del cliente (un VIEWER puede leer pero no marcar).

## Base de datos y migraciones

El esquema vive en [src/db/schema.ts](src/db/schema.ts) y las migraciones en `src/db/migrations/`. Para cambiar el modelo:

1. Edita `schema.ts`.
2. Ejecuta `pnpm run db:generate` y revisa el SQL generado.
3. Ejecuta `pnpm run db:migrate`.
4. Versiona juntos el `.sql` y los cambios en `migrations/meta/`.

## Pruebas

- **Unitarias** (`src/**/*.spec.ts`): casos de uso, reglas de dominio y guards, con dependencias simuladas.
- **E2E** (`test/*.e2e-spec.ts`): levantan la aplicación Nest completa contra PostgreSQL. Antes de ejecutarlas haz `docker:up` y `db:migrate`. [test/setup-e2e.ts](test/setup-e2e.ts) define valores por defecto para `DATABASE_URL` y WhatsApp, y simula la sesión con una cookie de prueba; `test/supabase-auth.e2e-spec.ts` prueba la sesión real con JWT.

Secuencia completa antes de entregar un bloque (en PowerShell 5 no existe `&&`: un comando por línea):

```
pnpm run build:packages
pnpm run lint
pnpm run db:generate   # debe responder "No schema changes"
pnpm run db:migrate
pnpm test
pnpm run test:e2e
```

Los e2e usan un timeout de 30 s por test y por hook (`test/jest-e2e.json`): arrancar Nest y sembrar datos puede tardar más de los 5 s por defecto de Jest cuando corren muchas suites en paralelo.


## Webhooks salientes, WhatsApp por proyecto y scopes de API keys

- **WhatsApp por proyecto** (`PUT /projects/:id/whatsapp/config`): el token se guarda cifrado (AES-256-GCM, `ENCRYPTION_KEY`) y nunca se devuelve. Sin cuenta guardada se usan las variables `WHATSAPP_*` de siempre. El webhook **entrante** de Meta (`/api/v1/webhooks/whatsapp`) no cambia.
- **Plantillas**: `POST/GET/DELETE /projects/:id/whatsapp/templates` crean, listan (todos los estados con `/all`) y borran plantillas en Meta. `WHATSAPP_TEMPLATES_DRY_RUN=true` evita llamar a Meta.
- **Respuestas rapidas**: `/projects/:id/quick-replies`.
- **API keys con scopes**: `catalog:read`, `leads:read`, `leads:write`, `quotes:write`. Las claves existentes conservan todos. Una clave sin el scope de la ruta recibe 403.
- **Webhooks salientes** (`/projects/:id/webhooks`): cada evento de actividad (`lead.created`, `message.received`, `quote.status_changed`...; ver `GET .../webhooks/events`) se envia por POST a las URLs registradas, con 3 intentos y registro en `.../deliveries`. Solo https y hosts publicos (proteccion SSRF).

  Cada envio lleva `X-Flowcommerce-Signature: t=<unix>,v1=<hex>` donde `v1 = HMAC-SHA256(secreto, "<t>.<cuerpo crudo>")`. El receptor debe recalcularlo con el cuerpo **crudo**, compararlo en tiempo constante y rechazar si `|ahora - t| > 300 s`. Hay una implementacion de referencia en `src/webhooks/domain/signing.ts`.

## Supabase: base de datos, Storage y Auth

- **Auth.** El frontend inicia sesión, se registra y recupera la contraseña con `supabase-js`, y manda el access token en `Authorization: Bearer <jwt>`. La API lo verifica (JWKS, o `SUPABASE_JWT_SECRET` si el proyecto usa HS256) y enlaza al usuario por id: `users.id` es el mismo que `auth.users.id`. La primera vez que llega un token sin perfil local, se crea. `GET /auth/session` devuelve quién es el token. Ya no existen `/auth/sign-up`, `/login`, `/logout`, `/forgot-password` ni `/reset-password`.
- **Solicitudes de acceso.** Al aprobar una, la API crea la cuenta en Supabase (invitación por correo para definir la contraseña) y la hace miembro del proyecto. Si Supabase falla, la solicitud vuelve a `PENDING`.
- **Base de datos.** Todas las tablas de `public` tienen RLS activado y ninguna política: la clave `anon` del frontend no puede leer ni escribir nada directo. La API se conecta con un rol que se salta RLS. Una prueba (`test/rls.e2e-spec.ts`) falla si una migración nueva crea una tabla sin activarlo.
- **Storage.** Crea un bucket **privado** y usa `FILE_STORAGE_DRIVER=supabase`. Los archivos salen siempre por la API, que revisa el proyecto del usuario.
- **Pasos en el panel de Supabase:** crear el bucket privado, desactivar los registros abiertos si el acceso es solo por invitación y configurar el SMTP de Auth.
