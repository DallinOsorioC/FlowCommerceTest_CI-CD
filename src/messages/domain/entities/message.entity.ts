import type {
  Message,
  MessageDirection,
  MessageId,
  MessageType,
} from '@flowcommerce/types';

// Entidad de dominio de un mensaje de WhatsApp. El CONTENIDO es inmutable (un
// mensaje enviado no se edita, se envía otro); lo único que cambia con el
// tiempo es el estado que reporta WhatsApp (SENT → DELIVERED → READ / FAILED)
// y, en los entrantes, cuándo se leyó en el CRM. El whatsappMessageId es el
// identificador que asignó la API de WhatsApp y es la clave de idempotencia
// del webhook.
export class MessageEntity implements Message {
  constructor(
    public readonly id: MessageId,
    public readonly projectId: string,
    public readonly leadId: string,
    public readonly whatsappMessageId: string,
    public readonly direction: MessageDirection,
    public readonly content: string,
    public readonly status: string,
    public readonly creadoEn: Date,
    public readonly errorMessage: string | null = null,
    public readonly readAt: Date | null = null,
    public readonly type: MessageType = 'TEXT',
    public readonly templateName: string | null = null,
    public readonly attachmentId: string | null = null,
  ) {}

  toMessage(): Message {
    return {
      id: this.id,
      projectId: this.projectId,
      leadId: this.leadId,
      whatsappMessageId: this.whatsappMessageId,
      direction: this.direction,
      type: this.type,
      content: this.content,
      templateName: this.templateName,
      attachmentId: this.attachmentId,
      status: this.status,
      errorMessage: this.errorMessage,
      readAt: this.readAt,
      creadoEn: this.creadoEn,
    };
  }
}
