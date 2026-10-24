// WhatsApp Cloud API espera el destinatario en dígitos E.164 sin '+' ni
// espacios. El CRM puede guardar el teléfono con formato local, así que se
// normaliza en un solo sitio para el envío y para casar el webhook con un lead.
export function normalizeWhatsAppPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}
