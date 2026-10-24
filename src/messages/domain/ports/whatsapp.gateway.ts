// Puerto de salida hacia la API de WhatsApp. Vive en domain/ porque los
// use-cases dependen de él, no de ningún SDK concreto.
//
// La API es quien asigna whatsappMessageId, y esa columna es NOT NULL con
// índice único. Por eso el contrato devuelve el id en lugar de recibirlo:
// el orden obligatorio es llamar a WhatsApp primero y persistir después, y
// este puerto hace explícito ese orden.
export interface SendWhatsAppMessageInput {
  projectId: string;
  leadId: string;
  // Destinatario. El use-case lo resuelve desde el lead antes de llamar aquí.
  phone: string | null;
  content: string;
}

export interface SendWhatsAppMessageResult {
  // Id devuelto por la API. Se guarda tal cual en messages.whatsapp_message_id.
  whatsappMessageId: string;
  // Estado inicial que la API reporta para el mensaje.
  status: string;
}

// Plantilla aprobada por Meta. Es la ÚNICA forma de escribirle a un cliente
// que no ha escrito en las últimas 24 h.
export interface WhatsAppTemplate {
  name: string;
  // Código de idioma de Meta ("es", "es_MX", "en_US").
  language: string;
  // MARKETING, UTILITY o AUTHENTICATION.
  category: string;
  status: string;
  // Texto del cuerpo con sus variables {{1}}, {{2}}…
  bodyText: string | null;
  // Cuántas variables hay que mandar para el cuerpo.
  bodyParameterCount: number;
  // true si el encabezado necesita datos (imagen, documento o texto con
  // variables): esas plantillas no se pueden enviar desde el CRM todavía.
  headerNeedsParameters: boolean;
}

export interface SendWhatsAppTemplateInput {
  projectId: string;
  leadId: string;
  phone: string | null;
  templateName: string;
  language: string;
  bodyParameters: string[];
}

export type WhatsAppMediaKind = 'image' | 'document' | 'audio' | 'video';

export interface SendWhatsAppMediaInput {
  projectId: string;
  leadId: string;
  phone: string | null;
  kind: WhatsAppMediaKind;
  content: Buffer;
  mimeType: string;
  fileName: string;
  // Pie de foto (no aplica a audio).
  caption: string | null;
}

export interface DownloadedWhatsAppMedia {
  content: Buffer;
  mimeType: string;
}

export interface CreateWhatsAppTemplateInput {
  // Minúsculas, dígitos y guion bajo (regla de Meta).
  name: string;
  language: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  bodyText: string;
  // Un valor de ejemplo por variable {{n}}, en orden (Meta los exige).
  bodyExamples: string[];
}

export interface CreatedWhatsAppTemplate {
  id: string;
  status: string;
}

export interface VerifyWhatsAppCredentialsInput {
  token: string;
  phoneNumberId: string;
}

export interface WhatsAppGateway {
  // Comprueba con Meta que el token tiene acceso a ese número. Lanza
  // ConflictException con el motivo de Meta si lo rechaza.
  verifyCredentials(input: VerifyWhatsAppCredentialsInput): Promise<void>;
  send(input: SendWhatsAppMessageInput): Promise<SendWhatsAppMessageResult>;
  sendTemplate(
    input: SendWhatsAppTemplateInput,
  ): Promise<SendWhatsAppMessageResult>;
  // Sube el archivo a WhatsApp y envía el mensaje con él.
  sendMedia(input: SendWhatsAppMediaInput): Promise<SendWhatsAppMessageResult>;
  // Plantillas de la cuenta de WhatsApp Business del proyecto. Por defecto
  // solo las APROBADAS; allStatuses incluye pendientes y rechazadas.
  listTemplates(
    projectId: string,
    options?: { allStatuses?: boolean },
  ): Promise<WhatsAppTemplate[]>;
  // Envía la plantilla a revisión de Meta (queda PENDING hasta aprobarla).
  createTemplate(
    projectId: string,
    input: CreateWhatsAppTemplateInput,
  ): Promise<CreatedWhatsAppTemplate>;
  deleteTemplate(projectId: string, name: string): Promise<void>;
  // Descarga un archivo recibido (imagen, documento…) por su media id.
  // maxBytes: si WhatsApp informa un tamaño mayor, no se descarga (null).
  downloadMedia(
    projectId: string,
    mediaId: string,
    maxBytes: number,
  ): Promise<DownloadedWhatsAppMedia | null>;
}

export const WHATSAPP_GATEWAY = Symbol('WHATSAPP_GATEWAY');

// Texto final de una plantilla: {{1}}, {{2}}… reemplazados por sus valores.
// Es lo que se guarda en messages.content y se ve en el chat del CRM.
export function renderTemplateBody(
  bodyText: string | null,
  parameters: readonly string[],
  templateName: string,
): string {
  if (!bodyText) {
    return `[Plantilla ${templateName}]`;
  }
  return bodyText.replace(/\{\{\s*(\d+)\s*\}\}/g, (match, index: string) => {
    const value = parameters[Number(index) - 1];
    return value === undefined ? match : value;
  });
}

// Número de variables distintas {{n}} del texto (la mayor n).
export function countTemplateParameters(
  text: string | null | undefined,
): number {
  if (!text) {
    return 0;
  }
  let max = 0;
  for (const match of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return max;
}
